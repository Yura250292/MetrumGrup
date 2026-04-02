import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Telegram } from 'telegraf';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import fetch from 'node-fetch';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

let genAI: GoogleGenerativeAI | null = null;

if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

/**
 * Завантажує аудіо файл з Telegram
 */
async function downloadAudio(telegram: Telegram, fileId: string): Promise<{ path: string; mimeType: string }> {
  const file = await telegram.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error('Failed to download audio file');
  }

  const buffer = await response.buffer();

  // Зберігаємо тимчасово
  const tempPath = path.join('/tmp', `audio_${Date.now()}.ogg`);
  await writeFile(tempPath, buffer);

  return {
    path: tempPath,
    mimeType: 'audio/ogg'
  };
}

/**
 * Конвертує аудіо в текст через Gemini
 */
export async function transcribeAudio(telegram: Telegram, fileId: string): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API не налаштовано');
  }

  let audioPath: string | null = null;

  try {
    console.log('📥 Завантаження аудіо файлу...');
    const audio = await downloadAudio(telegram, fileId);
    audioPath = audio.path;

    console.log('🎙️ Розпізнавання аудіо через Gemini...');

    // Читаємо файл як base64
    const audioBuffer = fs.readFileSync(audioPath);
    const base64Audio = audioBuffer.toString('base64');

    // Використовуємо Gemini для розпізнавання
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Audio,
          mimeType: audio.mimeType
        }
      },
      'Транскрибуй цей аудіо файл українською мовою. Якщо в аудіо інша мова - переклади на українську. Надай тільки текст, без додаткових коментарів.'
    ]);

    const response = await result.response;
    const text = response.text();

    console.log('✅ Текст розпізнано:', text.substring(0, 100) + '...');

    return text;
  } catch (error) {
    console.error('❌ Помилка розпізнавання аудіо:', error);
    throw new Error('Не вдалося розпізнати аудіо. Спробуйте ще раз або напишіть текстом.');
  } finally {
    // Видаляємо тимчасовий файл
    if (audioPath) {
      try {
        await unlink(audioPath);
      } catch (e) {
        console.error('Не вдалося видалити тимчасовий файл:', e);
      }
    }
  }
}

/**
 * Конвертує аудіо в текст для подальшої обробки
 */
export async function processVoiceMessage(telegram: Telegram, fileId: string, duration: number): Promise<{
  text: string;
  duration: number;
  success: boolean;
}> {
  try {
    // Перевірка тривалості (максимум 2 хвилини)
    if (duration > 120) {
      throw new Error('Аудіо занадто довге. Максимум 2 хвилини.');
    }

    const text = await transcribeAudio(telegram, fileId);

    return {
      text,
      duration,
      success: true
    };
  } catch (error) {
    console.error('Error processing voice message:', error);
    return {
      text: '',
      duration,
      success: false
    };
  }
}

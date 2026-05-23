/**
 * Cinematic scrollytelling scenes for the Metrum hero.
 *
 * Master video at /public/videos/building-flythrough-desktop.mp4 (~33.6s).
 *
 * Each scene's window is expressed in ABSOLUTE VIDEO SECONDS so timing is
 * intuitive — change `videoStart` / `videoEnd` to retime any scene.
 *
 * Text visibility window inside each scene:
 *   • fades IN  during [videoStart,           videoStart + fadeIn]
 *   • fully visible      [videoStart + fadeIn, videoEnd  - fadeOut]
 *   • fades OUT during   [videoEnd   - fadeOut, videoEnd]
 *
 * `fadeOut` defaults to 1.0s so the overlay disappears ~1 second BEFORE the
 * next shot, giving the cut room to breathe.
 */

const TEAM_CDN = "https://pub-5a3b46357b004b00a737ee06f5ca9ad2.r2.dev/cinematic/team";

export type CTA = { label: string; href: string };
export type Metric = { value: string; label: string };
export type TeamCard = { name: string; role: string; photo: string };
export type Contact = { phone: string; email: string; address: string };

export type Scene = {
  id: string;
  shot: string;
  videoStart: number; // seconds
  videoEnd: number; // seconds (use Infinity for "until end of video")
  fadeIn?: number; // seconds; default 0.4
  fadeOut?: number; // seconds; default 1.0
  eyebrow: string;
  title: string;
  description: string;
  metrics?: Metric[];
  team?: TeamCard[];
  contact?: Contact;
  ctaPrimary?: CTA;
  ctaSecondary?: CTA;
};

export const VIDEO_DURATION = 33.6; // approximate; runtime uses real metadata

export const SCENES: Scene[] = [
  // ── 1. Фасад (0–4s) ────────────────────────────────────────────
  {
    id: "facade",
    shot: "0–4s · фасад",
    videoStart: 0,
    videoEnd: 4,
    fadeIn: 0.3,
    fadeOut: 0.8,
    eyebrow: "Metrum Group · Львів",
    title: "Будуємо те,\nщо залишається.",
    description:
      "10+ років. ISO. Forbes Next 250. Повний цикл — будівництво, ремонт, нерухомість.",
  },

  // ── 2. Наближення до входу (5–9s) ──────────────────────────────
  {
    id: "approach",
    shot: "5–9s · наближення",
    videoStart: 5,
    videoEnd: 9,
    fadeIn: 0.3,
    fadeOut: 0.8,
    eyebrow: "Повний цикл",
    title: "Від ділянки\nдо ключів.",
    description:
      "Архітектура, кошториси, будівництво, інтер'єри, продаж — усе в одному кабінеті.",
  },

  // ── 3. Прохід крізь двері (9–13s) ──────────────────────────────
  {
    id: "threshold",
    shot: "9–13s · вхід",
    videoStart: 9,
    videoEnd: 13,
    fadeIn: 0.3,
    fadeOut: 0.8,
    eyebrow: "Всередині",
    title: "Прозоро.\nБез «раптом».",
    description:
      "Кошторис без сюрпризів. Щотижневі фотозвіти. Доступ до всіх документів — у вашому особистому кабінеті.",
  },

  // ── 4. Лобі (14–19s) — метрики ─────────────────────────────────
  {
    id: "lobby",
    shot: "14–19s · лобі",
    videoStart: 14,
    videoEnd: 19,
    fadeIn: 0.4,
    fadeOut: 1.0,
    eyebrow: "За цифрами",
    title: "Сотні людей.\nТисячі рішень.",
    description:
      "За кожною цифрою — реальний проєкт, реальний клієнт, конкретний результат.",
    metrics: [
      { value: "$12M+", label: "ПРОДАЖІВ НЕРУХОМОСТІ" },
      { value: "3 000+", label: "УСПІШНИХ УГОД" },
      { value: "200K+", label: "м² ВІДРЕМОНТОВАНО" },
    ],
  },

  // ── 5. Коридор (19–22s) — принципи (skoroceno na 2s) ──────────
  {
    id: "principles",
    shot: "19–22s · коридор",
    videoStart: 19,
    videoEnd: 22,
    fadeIn: 0.4,
    fadeOut: 0.8,
    eyebrow: "Принципи",
    title: "Тримати слово.\nНе ховати ризики.",
    description:
      "Три речі, на яких будується наша репутація: прозорість, якість, відповідальність.",
    metrics: [
      { value: "ISO", label: "СЕРТИФІКОВАНИЙ ПАРТНЕР" },
      { value: "3 РОКИ", label: "ГАРАНТІЇ НА РЕМОНТ" },
    ],
  },

  // ── 6. Кабінет директора + бренд (22–end) — команда + CTA ──────
  {
    id: "outro",
    shot: "22–end · кабінет + brand",
    videoStart: 22,
    videoEnd: Infinity, // until video ends
    fadeIn: 0.5,
    fadeOut: 0.6,
    eyebrow: "Команда · Metrum Group",
    title: "Люди,\nякі тримають слово.",
    description:
      "За кожним проєктом — конкретна людина та її репутація. Готові побудувати ваше — безкоштовна консультація 30 хвилин.",
    team: [
      { name: "Шиба Ігор", role: "CEO · Засновник", photo: `${TEAM_CDN}/shyba.jpg` },
      { name: "Лащук Володимир", role: "Фінансовий директор", photo: `${TEAM_CDN}/laschuk.jpg` },
      { name: "Шахов Роман", role: "Студія дизайну", photo: `${TEAM_CDN}/shakhov.jpg` },
      { name: "Пехник Андрій", role: "Головний інженер", photo: `${TEAM_CDN}/pekhnyk-andriy.jpg` },
      { name: "Іванчихіна Юлія", role: "Агентство нерухомості", photo: `${TEAM_CDN}/ivanchykhina.jpg` },
      { name: "Пехник Христина", role: "Кошторисниця", photo: `${TEAM_CDN}/pekhnyk-khrystyna.jpg` },
    ],
    contact: {
      phone: "+380 67 743 01 01",
      email: "contact@metrum.com.ua",
      address: "м. Львів, вул. Антоновича, 120",
    },
    ctaPrimary: { label: "Обговорити проєкт", href: "tel:+380677430101" },
    ctaSecondary: { label: "Написати email", href: "mailto:contact@metrum.com.ua" },
  },
];

// ── Time-based opacity / motion helpers ──────────────────────────

/**
 * Compute scene overlay opacity from the CURRENT VIDEO TIME (seconds).
 * Eases in for `fadeIn` seconds, eases out for `fadeOut` seconds before
 * the scene window ends. Returns 0 outside the window.
 */
export function getSceneOpacityByTime(
  time: number,
  start: number,
  end: number,
  fadeIn = 0.4,
  fadeOut = 1.0,
): number {
  if (time <= start) return 0;
  if (time >= end) return 0;
  if (time < start + fadeIn) {
    const t = (time - start) / fadeIn;
    return 1 - Math.pow(1 - t, 3); // ease-out cubic
  }
  if (time > end - fadeOut) {
    const t = (time - (end - fadeOut)) / fadeOut;
    return Math.pow(1 - t, 3); // ease-in cubic
  }
  return 1;
}

/** Subtle parallax for inactive scenes. */
export function getSceneTransformByTime(
  time: number,
  start: number,
  end: number,
): { y: number; blur: number } {
  if (time < start) return { y: 32, blur: 10 };
  if (time > end) return { y: -32, blur: 10 };
  return { y: 0, blur: 0 };
}

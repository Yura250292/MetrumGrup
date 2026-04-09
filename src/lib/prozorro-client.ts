/**
 * Prozorro Public API Client
 * Інтеграція з публічним API Prozorro для пошуку схожих тендерів
 *
 * API Documentation: https://public-api.prozorro.gov.ua/api/2.5/
 */

import { prisma } from './prisma';

const PROZORRO_BASE_URL = 'https://public-api.prozorro.gov.ua/api/2.5';
const REQUEST_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const CACHE_DURATION_COMPLETED = 24 * 60 * 60 * 1000; // 24 hours for completed tenders
const CACHE_DURATION_ACTIVE = 60 * 60 * 1000; // 1 hour for active tenders

export interface ProzorroSearchParams {
  classification?: string;        // CPV код (будівництво: 45000000)
  valueAmount?: string;           // фільтр по сумі: >=1000000,<=5000000
  status?: 'active' | 'complete'; // завершені тендери для ціни переможця
  dateModified?: string;          // пошук за датою (>=2024-01-01)
  limit?: number;                 // кількість результатів
  offset?: number;                // пагінація
}

export interface ProzorroDocument {
  id: string;
  title: string;
  url: string;
  format: string;              // "application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  documentType: string;        // "billOfQuantity" (кошторис), "technicalSpecifications", etc
  datePublished: string;
  dateModified: string;
  language?: string;
}

export interface ProzorroTender {
  id: string;
  title: string;
  description: string;
  status: string;
  value: {
    amount: number;
    currency: string;
    valueAddedTaxIncluded: boolean;
  };
  procuringEntity: {
    name: string;
    identifier: {
      id: string;
    };
  };
  classification: {
    id: string;        // CPV код
    description: string;
  };
  datePublished: string;
  dateModified: string;
  awards?: Array<{
    value: {
      amount: number;
    };
    status: 'active' | 'unsuccessful';
  }>;
  documents?: ProzorroDocument[];  // 📄 Документи тендера
}

interface ProzorroAPIResponse {
  data: ProzorroTender[];
  next_page?: {
    offset: string;
  };
}

/**
 * Prozorro API Client
 */
export class ProzorroClient {
  private baseUrl = PROZORRO_BASE_URL;

  /**
   * Пошук тендерів з фільтрами
   */
  async searchTenders(params: ProzorroSearchParams): Promise<ProzorroTender[]> {
    console.log('🔍 Пошук тендерів на Prozorro:', params);

    try {
      // Побудувати query string
      const queryParams = new URLSearchParams();

      if (params.classification) {
        queryParams.append('classification.id', params.classification);
      }

      if (params.valueAmount) {
        queryParams.append('value.amount', params.valueAmount);
      }

      if (params.status) {
        queryParams.append('status', params.status);
      }

      if (params.dateModified) {
        queryParams.append('dateModified', params.dateModified);
      }

      if (params.limit) {
        queryParams.append('limit', params.limit.toString());
      }

      if (params.offset) {
        queryParams.append('offset', params.offset.toString());
      }

      // Виконати запит
      const url = `${this.baseUrl}/tenders?${queryParams.toString()}`;
      const tenders = await this.fetchWithRetry<ProzorroAPIResponse>(url);

      console.log(`✅ Знайдено ${tenders.data.length} тендерів`);

      // Кешувати результати в БД
      await this.cacheTenders(tenders.data);

      return tenders.data;
    } catch (error) {
      console.error('❌ Помилка пошуку тендерів:', error);
      throw new Error(`Не вдалося знайти тендери на Prozorro: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 🆕 ПОВНОЦІННИЙ ПОШУК тендерів через prozorro.gov.ua/api/search/tenders
   *
   * Це єдиний правильний endpoint для пошуку — старий /api/2.5/tenders
   * це crawler який повертає всі тендери підряд без фільтрації по тексту/CPV.
   *
   * Цей endpoint повертає РЕЛЕВАНТНІ результати з повними даними одразу
   * (title, value, procuringEntity, tenderID, status).
   */
  async searchTendersByText(params: {
    text: string;
    page?: number;
    perPage?: number;
    status?: string;
    classification?: string;
  }): Promise<Array<{
    id?: string;
    tenderID: string;
    title: string;
    description?: string;
    value: { amount: number; currency: string; valueAddedTaxIncluded?: boolean };
    procuringEntity: { name: string; identifier?: any };
    status: string;
    datePublished?: string;
    dateModified?: string;
    awards?: any[];
  }>> {
    console.log(`🔍 Prozorro full-text search: "${params.text}"`);

    try {
      const body: any = {
        text: params.text,
        page: params.page || 1,
        per_page: params.perPage || 20,
      };

      if (params.status) {
        body.status = params.status;
      }
      if (params.classification) {
        body.classification = params.classification;
      }

      const url = 'https://prozorro.gov.ua/api/search/tenders';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Prozorro search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const results = data.data || [];

      console.log(`✅ Prozorro search: ${results.length} results (total: ${data.total || results.length})`);

      return results;
    } catch (error) {
      console.error('❌ Помилка повнотекстового пошуку Prozorro:', error);
      // Не кидаємо помилку — повертаємо пустий масив, щоб pre-analysis міг продовжити
      return [];
    }
  }

  /**
   * Отримати деталі конкретного тендера
   */
  async getTenderDetails(tenderId: string): Promise<ProzorroTender> {
    console.log(`🔍 Отримання деталей тендера: ${tenderId}`);

    try {
      // Спочатку перевірити кеш
      const cached = await this.getCachedTender(tenderId);
      if (cached) {
        console.log(`✅ Тендер знайдено в кеші: ${tenderId}`);
        return cached;
      }

      // Якщо немає в кеші - запитати API
      const url = `${this.baseUrl}/tenders/${tenderId}`;
      const response = await this.fetchWithRetry<{ data: ProzorroTender }>(url);

      // Зберегти в кеш
      await this.cacheTender(response.data);

      console.log(`✅ Отримано деталі тендера: ${tenderId}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Помилка отримання тендера ${tenderId}:`, error);
      throw new Error(`Не вдалося отримати тендер: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Отримати документи тендера (кошториси, специфікації)
   */
  async getTenderDocuments(
    tenderId: string,
    filterTypes?: string[]  // ['billOfQuantity', 'technicalSpecifications']
  ): Promise<ProzorroDocument[]> {
    console.log(`📄 Отримання документів тендера: ${tenderId}`);

    try {
      // Отримати повні деталі тендера
      const tender = await this.getTenderDetails(tenderId);

      if (!tender.documents || tender.documents.length === 0) {
        console.log(`⚠️ Тендер ${tenderId} не має документів`);
        return [];
      }

      // Фільтрувати по типу якщо вказано
      let documents = tender.documents;
      if (filterTypes && filterTypes.length > 0) {
        documents = documents.filter(doc => filterTypes.includes(doc.documentType));
      }

      console.log(`✅ Знайдено ${documents.length} документів для тендера ${tenderId}`);
      return documents;
    } catch (error) {
      console.error(`❌ Помилка отримання документів тендера ${tenderId}:`, error);
      throw new Error(`Не вдалося отримати документи: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Отримати тільки кошториси тендера
   */
  async getTenderEstimates(tenderId: string): Promise<ProzorroDocument[]> {
    return this.getTenderDocuments(tenderId, ['billOfQuantity']);
  }

  /**
   * Завантажити файл документа
   */
  async downloadDocument(documentUrl: string): Promise<{
    content: ArrayBuffer;
    contentType: string;
  }> {
    console.log(`📥 Завантаження документа: ${documentUrl}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT * 3); // Більший timeout для файлів

      const response = await fetch(documentUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      console.log(`✅ Документ завантажено (${content.byteLength} bytes, ${contentType})`);

      return {
        content,
        contentType,
      };
    } catch (error) {
      console.error(`❌ Помилка завантаження документа:`, error);
      throw new Error(`Не вдалося завантажити документ: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch з retry logic та timeout
   */
  private async fetchWithRetry<T>(url: string, retries = MAX_RETRIES): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        const isLastAttempt = attempt === retries;

        if (isLastAttempt) {
          throw error;
        }

        // Експоненційний backoff
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⚠️ Спроба ${attempt} не вдалася, повтор через ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Кешувати масив тендерів в БД
   */
  private async cacheTenders(tenders: ProzorroTender[]): Promise<void> {
    try {
      for (const tender of tenders) {
        await this.cacheTender(tender);
      }
    } catch (error) {
      console.error('⚠️ Помилка кешування тендерів:', error);
      // Не кидаємо помилку - кешування не критичне
    }
  }

  /**
   * Кешувати один тендер в БД
   */
  private async cacheTender(tender: ProzorroTender): Promise<void> {
    try {
      // ⚠️ Деякі тендери не мають value — пропускаємо їх
      if (!tender.value || tender.value.amount == null) {
        console.warn(`⏭️ Тендер ${tender.id} без value, пропускаємо`);
        return;
      }

      // Витягти ціну переможця (якщо є awards)
      const awardedAmount = tender.awards?.find(a => a.status === 'active')?.value?.amount || null;
      const awardedDate = awardedAmount ? new Date() : null; // TODO: get real award date

      await prisma.prozorroTender.upsert({
        where: { id: tender.id },
        create: {
          id: tender.id,
          title: tender.title || 'Без назви',
          description: tender.description || '',
          status: tender.status || 'unknown',
          valueAmount: tender.value.amount,
          valueCurrency: tender.value.currency || 'UAH',
          vatIncluded: tender.value.valueAddedTaxIncluded ?? true,
          procuringEntityName: tender.procuringEntity?.name || 'Невідомо',
          procuringEntityCode: tender.procuringEntity?.identifier?.id || 'unknown',
          cpvCode: tender.classification?.id || '00000000',
          cpvDescription: tender.classification?.description || '',
          datePublished: tender.datePublished ? new Date(tender.datePublished) : new Date(),
          dateModified: tender.dateModified ? new Date(tender.dateModified) : new Date(),
          awardedAmount: awardedAmount,
          awardedDate: awardedDate,
          rawData: tender as any,
          cachedAt: new Date(),
          lastAccessedAt: new Date(),
        },
        update: {
          title: tender.title || 'Без назви',
          description: tender.description || '',
          status: tender.status || 'unknown',
          valueAmount: tender.value.amount,
          awardedAmount: awardedAmount,
          awardedDate: awardedDate,
          rawData: tender as any,
          lastAccessedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`⚠️ Помилка збереження тендера ${tender.id}:`, error);
      // Не кидаємо помилку - кешування не критичне
    }
  }

  /**
   * Отримати тендер з кешу
   */
  private async getCachedTender(tenderId: string): Promise<ProzorroTender | null> {
    try {
      const cached = await prisma.prozorroTender.findUnique({
        where: { id: tenderId },
      });

      if (!cached) {
        return null;
      }

      // Перевірити чи не застарів кеш
      const cacheAge = Date.now() - cached.cachedAt.getTime();
      const maxAge = cached.status === 'complete'
        ? CACHE_DURATION_COMPLETED
        : CACHE_DURATION_ACTIVE;

      if (cacheAge > maxAge) {
        console.log(`⚠️ Кеш застарів для тендера ${tenderId}`);
        return null;
      }

      // Оновити lastAccessedAt
      await prisma.prozorroTender.update({
        where: { id: tenderId },
        data: { lastAccessedAt: new Date() },
      });

      // Повернути у форматі ProzorroTender
      return cached.rawData as unknown as ProzorroTender;
    } catch (error) {
      console.error(`⚠️ Помилка читання кешу для ${tenderId}:`, error);
      return null;
    }
  }

  /**
   * Utility: sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance
 */
export const prozorroClient = new ProzorroClient();

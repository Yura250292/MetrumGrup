'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, XCircle, FileEdit } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { uk } from 'date-fns/locale';

interface HistoryEvent {
  id: string;
  type: 'version' | 'approval' | 'change';
  timestamp: string;
  user: { name: string; role: string; email: string };
  description: string;
  eventType?: string;
  status?: string;
  metadata?: any;
}

interface EstimateHistoryTimelineProps {
  estimateId: string;
}

export function EstimateHistoryTimeline({ estimateId }: EstimateHistoryTimelineProps) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const response = await fetch(`/api/admin/estimates/${estimateId}/history`);

        if (!response.ok) {
          throw new Error('Не вдалося завантажити історію');
        }

        const data = await response.json();

        // Об'єднати всі події в єдиний timeline
        const allEvents: HistoryEvent[] = [
          ...data.versions.map((v: any) => ({
            id: v.id,
            type: 'version',
            timestamp: v.createdAt,
            user: v.createdBy,
            description: getVersionDescription(v.eventType, v.changeDescription),
            eventType: v.eventType,
          })),
          ...data.approvals.map((a: any) => ({
            id: a.id,
            type: 'approval',
            timestamp: a.reviewedAt,
            user: a.reviewer,
            description: getApprovalDescription(a.stepType, a.status, a.notes),
            status: a.status,
            metadata: { ipAddress: a.ipAddress },
          })),
          ...data.criticalChanges.map((c: any) => ({
            id: c.id,
            type: 'change',
            timestamp: c.createdAt,
            user: c.user,
            description: getChangeDescription(
              c.changeType,
              c.fieldName,
              c.oldValue,
              c.newValue,
              c.metadata,
            ),
          })),
        ];

        // Сортувати за часом (найновіші зверху)
        allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setEvents(allEvents);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [estimateId]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Завантаження історії...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-600">
        Помилка: {error}
      </div>
    );
  }

  if (events.length === 0) {
    return <div className="text-center py-8 text-gray-500">Історія змін порожня</div>;
  }

  return (
    <div className="space-y-4">
      {events.map((event, idx) => (
        <div key={event.id} className="relative">
          {idx !== events.length - 1 && (
            <div className="absolute left-5 top-12 h-full w-0.5 bg-gray-200 dark:bg-gray-700" />
          )}

          <Card className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
                {getEventIcon(event.type)}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {event.user.name}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {getRoleLabel(event.user.role)}
                  </Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(new Date(event.timestamp), {
                      addSuffix: true,
                      locale: uk,
                    })}
                  </span>
                </div>

                <p className="text-sm text-gray-700 dark:text-gray-300">{event.description}</p>

                {event.metadata?.ipAddress && (
                  <div className="mt-2 text-xs text-gray-400">
                    IP: {event.metadata.ipAddress}
                  </div>
                )}
              </div>

              {event.status && (
                <div className="flex-shrink-0">
                  {event.status === 'APPROVED' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}

function getEventIcon(type: string) {
  if (type === 'approval') return <CheckCircle className="w-5 h-5 text-white" />;
  if (type === 'change') return <FileEdit className="w-5 h-5 text-white" />;
  return <Clock className="w-5 h-5 text-white" />;
}

function getVersionDescription(eventType: string, description?: string) {
  if (description) return description;

  const labels: Record<string, string> = {
    CREATED: 'Створено кошторис',
    STATUS_CHANGED: 'Змінено статус',
    ENGINEER_APPROVED: 'Технічна перевірка пройдена',
    FINANCE_APPROVED: 'Фінансова перевірка пройдена',
    REJECTED: 'Відхилено',
  };

  return labels[eventType] || 'Оновлення';
}

function getApprovalDescription(stepType: string, status: string, notes?: string) {
  const action = status === 'APPROVED' ? 'Затвердив' : 'Відхилив';
  const step =
    stepType === 'ENGINEER_REVIEW'
      ? 'технічну перевірку'
      : stepType === 'FINANCE_REVIEW'
      ? 'фінансову перевірку'
      : 'кошторис';

  let desc = `${action} ${step}`;
  if (notes) desc += ` - ${notes}`;

  return desc;
}

function getChangeDescription(
  changeType: string,
  fieldName: string,
  oldValue: any,
  newValue: any,
  metadata?: any,
) {
  if (changeType === 'STATUS_CHANGE') {
    return `Змінено статус: ${oldValue} → ${newValue}`;
  }
  if (changeType === 'DISCOUNT_CHANGE') {
    return `Змінено знижку: ${oldValue}% → ${newValue}%`;
  }
  if (changeType === 'TOTAL_CHANGE') {
    return `Змінено суму: ${formatCurrency(oldValue)} → ${formatCurrency(newValue)}`;
  }
  if (changeType === 'NOTES_CHANGE') {
    return `Оновлено примітки кошторису`;
  }

  if (changeType === 'ITEM_ADDED') {
    const desc = newValue?.description ?? metadata?.itemDescription ?? 'позицію';
    const qty = newValue?.quantity;
    const unit = newValue?.unit;
    const price = newValue?.unitPrice;
    const tail =
      qty !== undefined && price !== undefined
        ? ` (${qty} ${unit ?? ''} × ${formatCurrency(price)})`
        : '';
    return `Додано позицію: "${desc}"${tail}`;
  }

  if (changeType === 'ITEM_REMOVED') {
    const desc = oldValue?.description ?? metadata?.itemDescription ?? 'позицію';
    return `Видалено позицію: "${desc}"`;
  }

  if (changeType === 'ITEM_FIELD_CHANGED') {
    const itemTitle = metadata?.itemDescription ? ` "${metadata.itemDescription}"` : '';
    if (fieldName === 'unitPrice') {
      return `Змінено ціну позиції${itemTitle}: ${formatCurrency(oldValue)} → ${formatCurrency(newValue)}`;
    }
    if (fieldName === 'quantity') {
      return `Змінено кількість позиції${itemTitle}: ${oldValue} → ${newValue}`;
    }
    if (fieldName === 'unit') {
      return `Змінено одиницю виміру позиції${itemTitle}: ${oldValue} → ${newValue}`;
    }
    if (fieldName === 'description') {
      return `Змінено опис позиції: "${oldValue}" → "${newValue}"`;
    }
    return `Оновлено позицію${itemTitle}: ${fieldName}`;
  }

  return `Оновлено ${fieldName}`;
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: 'Адміністратор',
    MANAGER: 'Менеджер',
    ENGINEER: 'Інженер',
    FINANCIER: 'Фінансист',
    CLIENT: 'Клієнт',
  };
  return labels[role] || role;
}

function formatCurrency(value: any) {
  if (typeof value !== 'number') return value;
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
  }).format(value);
}

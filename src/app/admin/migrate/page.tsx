"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Loader2, Database } from "lucide-react";

export default function MigratePage() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'migrating' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [dbInfo, setDbInfo] = useState<any>(null);

  const checkMigration = async () => {
    setStatus('checking');
    setMessage('Перевірка стану міграції...');

    try {
      const response = await fetch('/api/admin/migrate', {
        method: 'GET',
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus('error');
        setMessage(data.error || 'Помилка перевірки');
        return;
      }

      setDbInfo(data);
      setStatus('idle');
      setMessage(data.columnExists
        ? '✅ Міграція вже застосована'
        : '⚠️ Міграція потребує застосування'
      );

    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Невідома помилка');
    }
  };

  const applyMigration = async () => {
    if (!confirm('Застосувати міграцію analysisSummary до таблиці estimates?')) {
      return;
    }

    setStatus('migrating');
    setMessage('Застосування міграції...');

    try {
      const response = await fetch('/api/admin/migrate', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus('error');
        setMessage(data.error || 'Помилка застосування міграції');
        return;
      }

      setStatus('success');
      setMessage(data.message || 'Міграція успішно застосована!');

      // Перевірити статус знову
      setTimeout(checkMigration, 1000);

    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Невідома помилка');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">🔧 Database Migration</h1>
        <p className="text-sm text-muted-foreground">
          Застосування міграції для поля analysisSummary
        </p>
      </div>

      <Card className="p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <Database className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <h3 className="font-semibold mb-1">Міграція: Add analysisSummary</h3>
            <p className="text-sm text-muted-foreground">
              Додає поле analysisSummary (TEXT) до таблиці estimates для збереження звіту інженера про аналіз проекту.
            </p>
          </div>
        </div>

        {message && (
          <div className={`p-3 rounded-lg mb-4 flex items-start gap-2 ${
            status === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100' :
            status === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100' :
            'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
          }`}>
            {status === 'success' && <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />}
            {status === 'error' && <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />}
            {(status === 'checking' || status === 'migrating') &&
              <Loader2 className="h-5 w-5 flex-shrink-0 mt-0.5 animate-spin" />
            }
            <p className="text-sm">{message}</p>
          </div>
        )}

        {dbInfo && (
          <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg mb-4 font-mono text-xs text-gray-900 dark:text-gray-100">
            <div className="mb-2">
              <strong>Table:</strong> {dbInfo.tableName}
            </div>
            <div className="mb-2">
              <strong>Column:</strong> {dbInfo.columnName}
            </div>
            <div>
              <strong>Status:</strong>{' '}
              <span className={dbInfo.columnExists ? 'text-green-600' : 'text-orange-600'}>
                {dbInfo.status}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={checkMigration}
            variant="outline"
            disabled={status === 'checking' || status === 'migrating'}
          >
            {status === 'checking' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Перевірка...
              </>
            ) : (
              'Перевірити статус'
            )}
          </Button>

          <Button
            onClick={applyMigration}
            disabled={status === 'checking' || status === 'migrating' || (dbInfo?.columnExists === true)}
          >
            {status === 'migrating' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Застосування...
              </>
            ) : (
              'Застосувати міграцію'
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-4 bg-yellow-50 border-yellow-200">
        <div className="flex gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          <div className="text-sm text-yellow-900">
            <p className="font-semibold mb-1">Важливо:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Тільки SUPER_ADMIN може застосовувати міграції</li>
              <li>Міграція додасть колонку в БД якщо її ще немає</li>
              <li>Операція безпечна - використовує ADD COLUMN IF NOT EXISTS</li>
              <li>Після застосування перезавантажте сторінку кошторисів</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle, XCircle, Copy, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

interface ApprovalSignature {
  id: string;
  stepType: string;
  status: string;
  notes?: string;
  signatureHash: string;
  reviewedAt: string;
  reviewer: {
    name: string;
    email: string;
    role: string;
  };
  ipAddress?: string;
}

interface ApprovalSignatureCardProps {
  approvals: ApprovalSignature[];
  estimateId?: string;
}

export function ApprovalSignatureCard({ approvals, estimateId }: ApprovalSignatureCardProps) {
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  async function handleVerify(approvalId: string) {
    if (!estimateId) return;

    setVerifying(approvalId);
    try {
      const response = await fetch(`/api/admin/estimates/${estimateId}/approvals/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId }),
      });

      if (!response.ok) {
        throw new Error('Помилка верифікації');
      }

      const data = await response.json();
      setVerified(prev => ({ ...prev, [approvalId]: data.isValid }));
    } catch (error) {
      console.error('Verification failed:', error);
      setVerified(prev => ({ ...prev, [approvalId]: false }));
    } finally {
      setVerifying(null);
    }
  }

  function copySignature(hash: string, id: string) {
    navigator.clipboard.writeText(hash);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (approvals.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-gray-500">
          Немає підписів
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {approvals.map(approval => (
        <Card key={approval.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  {getStepLabel(approval.stepType)}
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {approval.reviewer.name} ({getRoleLabel(approval.reviewer.role)})
                </p>
              </div>
              <Badge
                variant={approval.status === 'APPROVED' ? 'default' : 'destructive'}
                className={
                  approval.status === 'APPROVED'
                    ? 'bg-green-600 hover:bg-green-700'
                    : ''
                }
              >
                {approval.status === 'APPROVED' ? 'Затверджено' : 'Відхилено'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Дата:</span>
                <p className="font-medium">
                  {format(new Date(approval.reviewedAt), 'dd MMMM yyyy, HH:mm', {
                    locale: uk,
                  })}
                </p>
              </div>
              {approval.ipAddress && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">IP адреса:</span>
                  <p className="font-medium font-mono text-xs">{approval.ipAddress}</p>
                </div>
              )}
            </div>

            {approval.notes && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                <span className="text-xs text-gray-500 dark:text-gray-400">Коментар:</span>
                <p className="text-sm mt-1">{approval.notes}</p>
              </div>
            )}

            <div className="border-t dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Цифровий підпис (SHA-256):
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copySignature(approval.signatureHash, approval.id)}
                  className="h-7"
                >
                  {copied === approval.id ? (
                    <CheckCircle className="w-3 h-3 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
              <p className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded break-all">
                {approval.signatureHash}
              </p>
            </div>

            {estimateId && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleVerify(approval.id)}
                  disabled={verifying === approval.id}
                >
                  {verifying === approval.id ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Перевірка...
                    </>
                  ) : (
                    'Верифікувати підпис'
                  )}
                </Button>

                {verified[approval.id] !== undefined && (
                  <div className="flex items-center gap-1">
                    {verified[approval.id] ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-600 font-medium">
                          Підпис валідний
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span className="text-sm text-red-600 font-medium">
                          Підпис невалідний!
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function getStepLabel(stepType: string) {
  const labels: Record<string, string> = {
    ENGINEER_REVIEW: 'Технічна перевірка',
    FINANCE_REVIEW: 'Фінансова перевірка',
    MANAGER_APPROVAL: 'Затвердження менеджером',
    REJECTION: 'Відхилення',
  };
  return labels[stepType] || stepType;
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

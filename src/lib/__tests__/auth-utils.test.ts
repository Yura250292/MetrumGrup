import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { Role } from '@prisma/client'

// ВАЖЛИВО: Мокуємо auth модуль ДО будь-яких імпортів
jest.mock('@/lib/auth')

// Тепер імпортуємо - Jest автоматично використає __mocks__/lib/auth.ts
import { auth } from '@/lib/auth'
import {
  getSession,
  requireAuth,
  requireRole,
  scopeByClient,
  unauthorizedResponse,
  forbiddenResponse,
  ADMIN_ROLES,
  ESTIMATE_ROLES,
  FINANCE_ROLES,
  requireAdminRole,
  requireEstimateAccess,
} from '../auth-utils'

// Отримуємо типізований мок
const mockAuth = auth as jest.MockedFunction<typeof auth>

// Helper для створення mock session
function createMockSession(role: Role = 'SUPER_ADMIN', userId: string = 'test-user-id') {
  return {
    user: {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      role,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

describe('auth-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getSession', () => {
    it('should return session when user is authenticated', async () => {
      const mockSession = createMockSession('SUPER_ADMIN')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await getSession()

      expect(session).toBe(mockSession)
      expect(mockAuth).toHaveBeenCalledTimes(1)
    })

    it('should return null when user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const session = await getSession()

      expect(session).toBeNull()
    })
  })

  describe('requireAuth', () => {
    it('should return session for authenticated user', async () => {
      const mockSession = createMockSession('SUPER_ADMIN')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireAuth()

      expect(session).toBe(mockSession)
    })

    it('should throw error when user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      await expect(requireAuth()).rejects.toThrow('Unauthorized')
    })

    it('should throw error when session has no user', async () => {
      mockAuth.mockResolvedValue({ user: null } as any)

      await expect(requireAuth()).rejects.toThrow('Unauthorized')
    })
  })

  describe('requireRole', () => {
    it('should allow access for SUPER_ADMIN role', async () => {
      const mockSession = createMockSession('SUPER_ADMIN')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireRole(['SUPER_ADMIN', 'MANAGER'])

      expect(session).toBe(mockSession)
    })

    it('should allow access for MANAGER role', async () => {
      const mockSession = createMockSession('MANAGER')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireRole(['SUPER_ADMIN', 'MANAGER'])

      expect(session).toBe(mockSession)
    })

    it('should deny access for CLIENT role when not allowed', async () => {
      const mockSession = createMockSession('CLIENT')
      mockAuth.mockResolvedValue(mockSession as any)

      await expect(requireRole(['SUPER_ADMIN', 'MANAGER'])).rejects.toThrow('Forbidden')
    })

    it('should allow access for CLIENT role when allowed', async () => {
      const mockSession = createMockSession('CLIENT')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireRole(['CLIENT', 'MANAGER'])

      expect(session).toBe(mockSession)
    })

    it('should deny access for USER role when not in allowed list', async () => {
      const mockSession = createMockSession('USER')
      mockAuth.mockResolvedValue(mockSession as any)

      await expect(requireRole(['SUPER_ADMIN', 'MANAGER'])).rejects.toThrow('Forbidden')
    })
  })

  describe('scopeByClient', () => {
    it('should filter by clientId for CLIENT role', () => {
      const session = createMockSession('CLIENT', 'client-123')

      const scope = scopeByClient(session)

      expect(scope).toEqual({ clientId: 'client-123' })
    })

    it('should allow full access for SUPER_ADMIN role', () => {
      const session = createMockSession('SUPER_ADMIN')

      const scope = scopeByClient(session)

      expect(scope).toEqual({})
    })

    it('should allow full access for MANAGER role', () => {
      const session = createMockSession('MANAGER')

      const scope = scopeByClient(session)

      expect(scope).toEqual({})
    })

    it('should return impossible condition for USER role', () => {
      const session = createMockSession('USER')

      const scope = scopeByClient(session)

      expect(scope).toEqual({ id: '__UNAUTHORIZED__' })
    })

    it('should return impossible condition for ENGINEER role', () => {
      const session = createMockSession('ENGINEER')

      const scope = scopeByClient(session)

      expect(scope).toEqual({ id: '__UNAUTHORIZED__' })
    })

    it('should return impossible condition for FINANCIER role', () => {
      const session = createMockSession('FINANCIER')

      const scope = scopeByClient(session)

      expect(scope).toEqual({ id: '__UNAUTHORIZED__' })
    })
  })

  describe('unauthorizedResponse', () => {
    it('should return 401 response', () => {
      const response = unauthorizedResponse()

      expect(response.status).toBe(401)
    })

    it('should return JSON with error', async () => {
      const response = unauthorizedResponse()
      const json = await response.json()

      expect(json).toEqual({
        error: 'Unauthorized',
        message: 'Необхідна авторизація',
      })
    })
  })

  describe('forbiddenResponse', () => {
    it('should return 403 response', () => {
      const response = forbiddenResponse()

      expect(response.status).toBe(403)
    })

    it('should return JSON with error', async () => {
      const response = forbiddenResponse()
      const json = await response.json()

      expect(json).toEqual({
        error: 'Forbidden',
        message: 'Недостатньо прав доступу',
      })
    })
  })

  describe('Role groups constants', () => {
    it('should define ADMIN_ROLES correctly', () => {
      expect(ADMIN_ROLES).toEqual(['SUPER_ADMIN', 'MANAGER'])
      expect(ADMIN_ROLES).toHaveLength(2)
    })

    it('should define ESTIMATE_ROLES correctly', () => {
      expect(ESTIMATE_ROLES).toEqual(['SUPER_ADMIN', 'MANAGER', 'ENGINEER', 'FINANCIER'])
      expect(ESTIMATE_ROLES).toHaveLength(4)
    })

    it('should define FINANCE_ROLES correctly', () => {
      expect(FINANCE_ROLES).toEqual(['SUPER_ADMIN', 'FINANCIER'])
      expect(FINANCE_ROLES).toHaveLength(2)
    })

    it('should have SUPER_ADMIN in all role groups', () => {
      expect(ADMIN_ROLES).toContain('SUPER_ADMIN')
      expect(ESTIMATE_ROLES).toContain('SUPER_ADMIN')
      expect(FINANCE_ROLES).toContain('SUPER_ADMIN')
    })
  })

  describe('requireAdminRole', () => {
    it('should allow access for SUPER_ADMIN', async () => {
      const mockSession = createMockSession('SUPER_ADMIN')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireAdminRole()

      expect(session).toBe(mockSession)
    })

    it('should allow access for MANAGER', async () => {
      const mockSession = createMockSession('MANAGER')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireAdminRole()

      expect(session).toBe(mockSession)
    })

    it('should deny access for ENGINEER', async () => {
      const mockSession = createMockSession('ENGINEER')
      mockAuth.mockResolvedValue(mockSession as any)

      await expect(requireAdminRole()).rejects.toThrow('Forbidden')
    })

    it('should deny access for CLIENT', async () => {
      const mockSession = createMockSession('CLIENT')
      mockAuth.mockResolvedValue(mockSession as any)

      await expect(requireAdminRole()).rejects.toThrow('Forbidden')
    })

    it('should deny access for unauthenticated user', async () => {
      mockAuth.mockResolvedValue(null)

      await expect(requireAdminRole()).rejects.toThrow('Unauthorized')
    })
  })

  describe('requireEstimateAccess', () => {
    it('should allow access for SUPER_ADMIN', async () => {
      const mockSession = createMockSession('SUPER_ADMIN')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireEstimateAccess()

      expect(session).toBe(mockSession)
    })

    it('should allow access for MANAGER', async () => {
      const mockSession = createMockSession('MANAGER')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireEstimateAccess()

      expect(session).toBe(mockSession)
    })

    it('should allow access for ENGINEER', async () => {
      const mockSession = createMockSession('ENGINEER')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireEstimateAccess()

      expect(session).toBe(mockSession)
    })

    it('should allow access for FINANCIER', async () => {
      const mockSession = createMockSession('FINANCIER')
      mockAuth.mockResolvedValue(mockSession as any)

      const session = await requireEstimateAccess()

      expect(session).toBe(mockSession)
    })

    it('should deny access for CLIENT', async () => {
      const mockSession = createMockSession('CLIENT')
      mockAuth.mockResolvedValue(mockSession as any)

      await expect(requireEstimateAccess()).rejects.toThrow('Forbidden')
    })

    it('should deny access for USER', async () => {
      const mockSession = createMockSession('USER')
      mockAuth.mockResolvedValue(mockSession as any)

      await expect(requireEstimateAccess()).rejects.toThrow('Forbidden')
    })

    it('should deny access for unauthenticated user', async () => {
      mockAuth.mockResolvedValue(null)

      await expect(requireEstimateAccess()).rejects.toThrow('Unauthorized')
    })
  })

  describe('Real-world authorization scenarios', () => {
    it('should handle typical admin workflow', async () => {
      const adminSession = createMockSession('SUPER_ADMIN', 'admin-1')
      mockAuth.mockResolvedValue(adminSession as any)

      // Admin має доступ до всіх ресурсів
      const session = await requireAdminRole()
      const scope = scopeByClient(session)

      expect(scope).toEqual({}) // Повний доступ
    })

    it('should handle typical client workflow', async () => {
      const clientSession = createMockSession('CLIENT', 'client-42')
      mockAuth.mockResolvedValue(clientSession as any)

      // Client може тільки переглядати власні проєкти
      const scope = scopeByClient(clientSession)

      expect(scope).toEqual({ clientId: 'client-42' })
      await expect(requireAdminRole()).rejects.toThrow('Forbidden')
    })

    it('should handle engineer access to estimates', async () => {
      const engineerSession = createMockSession('ENGINEER', 'eng-5')
      mockAuth.mockResolvedValue(engineerSession as any)

      // Engineer має доступ до кошторисів
      const session = await requireEstimateAccess()
      expect(session).toBe(engineerSession)

      // Але НЕ має admin доступ
      await expect(requireAdminRole()).rejects.toThrow('Forbidden')

      // І НЕ має повний доступ до даних
      const scope = scopeByClient(engineerSession)
      expect(scope).toEqual({ id: '__UNAUTHORIZED__' })
    })

    it('should handle financier access', async () => {
      const financierSession = createMockSession('FINANCIER', 'fin-3')
      mockAuth.mockResolvedValue(financierSession as any)

      // Financier має доступ до кошторисів
      await expect(requireEstimateAccess()).resolves.toBeDefined()

      // Але НЕ має admin доступ
      await expect(requireAdminRole()).rejects.toThrow('Forbidden')
    })
  })
})

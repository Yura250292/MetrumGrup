import { Session } from 'next-auth'
import { Role } from '@prisma/client'

export const createMockSession = (role: Role = 'SUPER_ADMIN', userId: string = 'test-user-id'): Session => ({
  user: {
    id: userId,
    email: 'test@example.com',
    name: 'Test User',
    role,
    firmId: null,
    firmAccess: {},
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
})

export const auth = jest.fn()

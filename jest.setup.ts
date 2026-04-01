import '@testing-library/jest-dom'

// Глобальне мокування next-auth для уникнення ESM проблем
jest.mock('next-auth', () => {
  const mockAuth = jest.fn()
  return {
    __esModule: true,
    default: jest.fn(() => ({
      handlers: { GET: jest.fn(), POST: jest.fn() },
      auth: mockAuth,
      signIn: jest.fn(),
      signOut: jest.fn(),
    })),
  }
})

jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn((config) => config),
}))

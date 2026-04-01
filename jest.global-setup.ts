// Глобальний setup для мокування проблемних ESM модулів
export default function() {
  // Mock next-auth глобально
  jest.mock('next-auth', () => {
    return jest.fn(() => ({
      handlers: {},
      auth: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    }))
  })

  jest.mock('next-auth/providers/credentials', () => {
    return jest.fn((config) => config)
  })
}

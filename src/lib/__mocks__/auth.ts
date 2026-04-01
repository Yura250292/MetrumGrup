// Jest автоматично використовує цей мок замість справжнього auth.ts
export const auth = jest.fn()

export const handlers = {
  GET: jest.fn(),
  POST: jest.fn(),
}

export const signIn = jest.fn()
export const signOut = jest.fn()

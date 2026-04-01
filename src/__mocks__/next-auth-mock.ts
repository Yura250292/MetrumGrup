// Mock for next-auth module to avoid ESM issues in Jest

const mockAuth = () => Promise.resolve(null)

const NextAuthMock = (config?: any) => ({
  handlers: {
    GET: () => Promise.resolve(null),
    POST: () => Promise.resolve(null),
  },
  auth: mockAuth,
  signIn: () => Promise.resolve({ ok: true }),
  signOut: () => Promise.resolve({ url: '/' }),
})

// Default export for NextAuth
module.exports = NextAuthMock
module.exports.default = NextAuthMock

// Named export for Credentials provider
module.exports.Credentials = (config?: any) => config

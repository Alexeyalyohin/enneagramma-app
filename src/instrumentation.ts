export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NODE_ENV === 'production' &&
    process.env['SESSION_MAINTENANCE_ENABLED'] === '1' &&
    !process.env['VERCEL']
  ) {
    const { startTestSessionMaintenance } = await import('@/lib/maintenance/scheduler')
    startTestSessionMaintenance()
  }
}

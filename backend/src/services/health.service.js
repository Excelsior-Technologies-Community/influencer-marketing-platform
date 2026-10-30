export async function getReadiness(checkDatabase) {
  try {
    await checkDatabase();
    return { ready: true, database: 'connected' };
  } catch {
    return { ready: false, database: 'unavailable' };
  }
}

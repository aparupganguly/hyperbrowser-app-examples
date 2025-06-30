import { readDb } from '../../../lib/db'

export async function GET() {
  const db = await readDb()
  return Response.json(db.changes.sort((a, b) => b.created_at.localeCompare(a.created_at)))
} 
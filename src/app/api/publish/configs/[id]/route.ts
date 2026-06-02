import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// DELETE /api/publish/configs/[id] — Remove platform config
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const config = await db.publishConfig.findUnique({ where: { id } })
    if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user || (config.userId !== user.id && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.publishConfig.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[publish-config-delete] Error:', error)
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 })
  }
}

// ============================================================
// Script File Upload + Parse API
// POST /api/upload/script
// Accepts a file via FormData, extracts text, returns metadata.
// Supported: .txt, .md, .docx, .pdf
// ============================================================

import { NextRequest, NextResponse } from 'next/server'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.docx', '.pdf']
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
]

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot).toLowerCase()
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) {
      return NextResponse.json(
        { error: '未提供文件，请上传文件（字段名: file）' },
        { status: 400 }
      )
    }

    // Validate that it's a File object
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: '无效的文件格式' },
        { status: 400 }
      )
    }

    const fileName = file.name
    const fileSize = file.size
    const fileType = file.type
    const ext = getFileExtension(fileName)

    // Validate file extension
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          error: `不支持的文件类型: ${ext || '无扩展名'}。仅支持: ${ALLOWED_EXTENSIONS.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate MIME type (loose check — some browsers send different MIME types)
    if (
      fileType &&
      fileType !== 'application/octet-stream' &&
      !ALLOWED_MIME_TYPES.includes(fileType)
    ) {
      return NextResponse.json(
        { error: `不支持的MIME类型: ${fileType}` },
        { status: 400 }
      )
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `文件过大: ${(fileSize / 1024 / 1024).toFixed(1)}MB。最大允许: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 }
      )
    }

    // Extract text based on file type
    let text: string

    if (ext === '.txt' || ext === '.md') {
      // Plain text: read as UTF-8
      const arrayBuffer = await file.arrayBuffer()
      const decoder = new TextDecoder('utf-8')
      text = decoder.decode(arrayBuffer)
    } else if (ext === '.docx') {
      // DOCX: use mammoth
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (ext === '.pdf') {
      // PDF: use pdf-parse
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const pdfParse = (await import('pdf-parse')) as any
      const pdfFn = pdfParse.default || pdfParse
      const result = await pdfFn(buffer)
      text = result.text
    } else {
      return NextResponse.json(
        { error: `不支持的文件类型: ${ext}` },
        { status: 400 }
      )
    }

    // Clean up extracted text
    text = text.replace(/\r\n/g, '\n').trim()

    if (!text) {
      return NextResponse.json(
        { error: '文件内容为空，无法提取文本' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      text,
      fileName,
      fileSize,
      fileType: ext.replace('.', ''),
      charCount: text.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[upload/script] Failed to parse file:', message)
    return NextResponse.json(
      { error: '文件解析失败', detail: message },
      { status: 500 }
    )
  }
}

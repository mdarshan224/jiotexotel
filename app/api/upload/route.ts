import { NextRequest, NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';
import path from 'path';

import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function isSafeImageContent(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 12) return false;
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mime === 'image/webp') {
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json(
        { success: false, message: 'Authentication is required to upload photos.' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const purpose = String(
      req.nextUrl?.searchParams.get('purpose') || formData.get('purpose') || ''
    )
      .trim()
      .toLowerCase();
    const isMaterialUpload = purpose === 'material';

    if (isMaterialUpload && !isAdminRole(authUser)) {
      return NextResponse.json(
        { success: false, message: 'Admin access is required to upload material catalog images.' },
        { status: 403 }
      );
    }

    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      const singleFile = formData.get('file') as File;
      if (singleFile) files.push(singleFile);
    }

    if (files.length === 0) {
      return NextResponse.json({ success: false, message: 'No file provided for upload.' }, { status: 400 });
    }

    if (files.length > 5) {
      return NextResponse.json(
        { success: false, message: 'Maximum 5 photos allowed per upload request.' },
        { status: 400 }
      );
    }

    const uploadedUrls: string[] = [];


    for (const file of files) {
      const mime = file.type ? file.type.toLowerCase().trim() : '';
      const safeExtension = ALLOWED_MIME_TYPES[mime];

      if (!safeExtension) {
        return NextResponse.json(
          { success: false, message: `Invalid file type for ${file.name || 'upload'}. Only JPG, PNG, and WEBP formats are supported.` },
          { status: 400 }
        );
      }

      // Max 10MB size limit per image
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        return NextResponse.json(
          { success: false, message: `File ${file.name || 'upload'} exceeds maximum allowed size of 10MB.` },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (!isSafeImageContent(buffer, mime)) {
        return NextResponse.json(
          { success: false, message: `File ${file.name || 'upload'} contains invalid or corrupted image data.` },
          { status: 400 }
        );
      }

      const randomSuffix = Math.random().toString(36).substring(2, 9);
      const filename = isMaterialUpload
        ? `material-photo-${Date.now()}-${randomSuffix}${safeExtension}`
        : `waste-photo-u_${authUser.userId}-${Date.now()}-${randomSuffix}${safeExtension}`;

      await env.BUCKET.put(filename, buffer, { httpMetadata: { contentType: mime }, customMetadata: { ownerId: authUser.userId } });
      uploadedUrls.push(`/api/upload/view?url=${encodeURIComponent(`/uploads/${filename}`)}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Photo(s) uploaded successfully.',
      urls: uploadedUrls,
      url: uploadedUrls[0],
    });
  } catch (error: any) {
    console.error('Photo upload error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to process photo upload.' },
      { status: 500 }
    );
  }
}

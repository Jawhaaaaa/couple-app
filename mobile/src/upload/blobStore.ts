import { type BlobStore, memoryBlobStore } from './blobStoreTypes';

/**
 * Native: файл өөрөө `file://` URI-аар дискэнд байдаг тул дараалал URI-г л хадгална — энэ
 * сан нь зөвхөн URI-гүй `Blob`-д (санах ойд, тухайн ажиллалтад). Вэбийн хувилбар
 * (`blobStore.web.ts`) IndexedDB-д хадгална: `blob:` URL хуудас дахин ачаалахад үхдэг.
 */
export const blobStore: BlobStore = memoryBlobStore();

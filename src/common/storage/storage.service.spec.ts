import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

function createStorageService(publicUrl = '/storage'): StorageService {
  return new StorageService(
    new ConfigService({
      S3_ENDPOINT: 'http://meerk-minio:9000/',
      S3_PUBLIC_URL: publicUrl,
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY: 'test',
      S3_SECRET_KEY: 'test',
      S3_BUCKET: 'meerk',
    }),
  );
}

describe('StorageService', () => {
  it('returns a browser-facing URL after upload', async () => {
    const storage = createStorageService('/storage/');
    const send = jest.fn().mockResolvedValue({});
    Reflect.set(storage, 'client', { send });

    const url = await storage.upload(
      'avatars/account/avatar.png',
      Buffer.from('image'),
      'image/png',
    );

    expect(url).toBe('/storage/meerk/avatars/account/avatar.png');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('normalizes legacy internal URLs without changing the stored object key', () => {
    const storage = createStorageService('/storage');

    expect(
      storage.normalizePublicUrl('http://meerk-minio:9000/meerk/avatars/account/avatar.png'),
    ).toBe('/storage/meerk/avatars/account/avatar.png');
  });

  it('leaves unrelated external URLs unchanged', () => {
    const storage = createStorageService('/storage');
    const externalUrl = 'https://cdn.example.com/avatars/account/avatar.png';

    expect(storage.normalizePublicUrl(externalUrl)).toBe(externalUrl);
  });

  it('normalizes a trailing slash in the public URL', () => {
    const storage = createStorageService('https://cdn.example.com/storage/');

    expect(storage.getPublicUrl('avatars/account/avatar.png')).toBe(
      'https://cdn.example.com/storage/meerk/avatars/account/avatar.png',
    );
  });
});

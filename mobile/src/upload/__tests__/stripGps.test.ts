import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { jpegName, stripGps } from '../stripGps';

/**
 * AC-21 (FR-5.2): зургийг илгээхийн өмнө GPS EXIF арилгана. Манипулятор нь дахин encode
 * хийхдээ metadata хуулдаггүй — тиймээс helper нь ЗААВАЛ дахин encode хийж, анхны (EXIF-тэй)
 * URI-г хэзээ ч буцаахгүй байхыг шалгана.
 */
jest.mock('expo-image-manipulator', () => {
  const context = {
    resize: jest.fn(),
    renderAsync: jest.fn(),
  };
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
    ImageManipulator: { manipulate: jest.fn(() => context), __context: context },
  };
});

type Ctx = { resize: jest.Mock; renderAsync: jest.Mock };
const ctx = (ImageManipulator as unknown as { __context: Ctx }).__context;
const manipulate = ImageManipulator.manipulate as jest.Mock;
let saveAsync: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  saveAsync = jest.fn(async () => ({ uri: 'file:///cache/clean.jpg', width: 2560, height: 1920 }));
  ctx.renderAsync.mockResolvedValue({ saveAsync });
});

describe('AC-21 stripGps — GPS-тэй зургийг metadata-гүй болгоно', () => {
  it('том зургийг ≤ 2560 болгож JPEG-ээр дахин encode хийнэ (EXIF хуулагдахгүй)', async () => {
    const out = await stripGps({ uri: 'file:///DCIM/gps.jpg', width: 4000, height: 3000 });
    expect(manipulate).toHaveBeenCalledWith('file:///DCIM/gps.jpg');
    expect(ctx.resize).toHaveBeenCalledWith({ width: 2560, height: 1920 });
    expect(saveAsync).toHaveBeenCalledWith(expect.objectContaining({ format: SaveFormat.JPEG }));
    // EXIF/base64 хадгалах сонголт дамжуулахгүй
    expect(saveAsync.mock.calls[0][0]).not.toHaveProperty('base64');
    expect(out).toEqual({ uri: 'file:///cache/clean.jpg', width: 2560, height: 1920, mime: 'image/jpeg' });
    expect(out.uri).not.toBe('file:///DCIM/gps.jpg');
  });

  it('жижиг зургийг ч гэсэн дахин encode хийнэ — анхны файл хэзээ ч илгээгдэхгүй', async () => {
    saveAsync.mockResolvedValueOnce({ uri: 'file:///cache/small.jpg', width: 800, height: 600 });
    const out = await stripGps({ uri: 'file:///DCIM/small-gps.jpg', width: 800, height: 600 });
    expect(ctx.resize).not.toHaveBeenCalled();
    expect(ctx.renderAsync).toHaveBeenCalledTimes(1);
    expect(saveAsync).toHaveBeenCalledTimes(1);
    expect(out.uri).toBe('file:///cache/small.jpg');
  });

  it('манипулятор амжилтгүй бол алдаа шидэгдэнэ (EXIF-тэй эх файлаар орлуулахгүй)', async () => {
    ctx.renderAsync.mockRejectedValueOnce(new Error('decode failed'));
    await expect(stripGps({ uri: 'file:///DCIM/broken.heic', width: 10, height: 10 })).rejects.toThrow('decode failed');
  });

  it('файлын нэр .jpg болно', () => {
    expect(jpegName('IMG_0001.HEIC')).toBe('IMG_0001.jpg');
    expect(jpegName('photo')).toBe('photo.jpg');
  });
});

package mn.aura.couple.media.app;

/** Бусад багцын IT-д зориулсан тестийн зураг (GPS EXIF-тэй JPEG). */
public final class ImageProcessorFixtures {

    private ImageProcessorFixtures() {
    }

    public static byte[] jpegWithGps(int width, int height) throws Exception {
        return ImageProcessorIT.jpegWithGps(width, height, 1);
    }
}

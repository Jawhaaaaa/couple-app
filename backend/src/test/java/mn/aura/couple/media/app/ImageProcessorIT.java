package mn.aura.couple.media.app;

import static org.assertj.core.api.Assertions.assertThat;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import javax.imageio.ImageIO;
import mn.aura.couple.AbstractIntegrationTest;
import mn.aura.couple.media.app.ImageProcessor.ProcessedImage;
import mn.aura.couple.media.app.ImageProcessor.Variant;
import org.apache.commons.imaging.formats.jpeg.exif.ExifRewriter;
import org.apache.commons.imaging.formats.tiff.constants.TiffTagConstants;
import org.apache.commons.imaging.formats.tiff.write.TiffOutputSet;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** AC-21 (GPS EXIF 0), AC-172 (3 хувилбар + blurhash), AC-129 (metadata цэвэрлэгдэнэ). */
@DisplayName("ImageProcessor")
class ImageProcessorIT extends AbstractIntegrationTest {

    @Autowired
    ImageProcessor processor;

    @Autowired
    MediaStorageService storage;

    /** Градиенттай JPEG + GPS (Улаанбаатар) ба orientation EXIF. */
    static byte[] jpegWithGps(int width, int height, int orientation) throws Exception {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setPaint(new GradientPaint(0, 0, new Color(0xE8, 0x6A, 0x5C), width, height, new Color(0x3A, 0x5F, 0xA8)));
        g.fillRect(0, 0, width, height);
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, width / 4, height / 4);
        g.dispose();
        ByteArrayOutputStream plain = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", plain);

        TiffOutputSet exif = new TiffOutputSet();
        exif.setGpsInDegrees(106.9177, 47.9184);
        exif.getOrCreateRootDirectory().add(TiffTagConstants.TIFF_TAG_ORIENTATION, (short) orientation);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        new ExifRewriter().updateExifMetadataLossless(plain.toByteArray(), out, exif);
        return out.toByteArray();
    }

    static boolean hasGps(byte[] jpeg) throws Exception {
        Metadata m = ImageMetadataReader.readMetadata(new ByteArrayInputStream(jpeg));
        GpsDirectory gps = m.getFirstDirectoryOfType(GpsDirectory.class);
        return gps != null && gps.getGeoLocation() != null;
    }

    static boolean hasExif(byte[] jpeg) throws Exception {
        Metadata m = ImageMetadataReader.readMetadata(new ByteArrayInputStream(jpeg));
        return m.getFirstDirectoryOfType(ExifIFD0Directory.class) != null
                || m.getFirstDirectoryOfType(ExifSubIFDDirectory.class) != null
                || m.getFirstDirectoryOfType(GpsDirectory.class) != null;
    }

    private static List<Variant> all(ProcessedImage p) {
        List<Variant> list = new ArrayList<>(p.variants());
        list.add(p.original());
        return list;
    }

    @Test
    @DisplayName("AC-21 серверт хадгалсан анхны ба thumbnail файлд GPS EXIF байхгүй")
    void gpsStrippedInStorage() throws Exception {
        byte[] input = jpegWithGps(1200, 800, 1);
        assertThat(hasGps(input)).as("оролтод GPS байх ёстой").isTrue();

        ProcessedImage processed = processor.process(input);
        UUID spaceId = UUID.randomUUID();
        UUID mediaId = UUID.randomUUID();
        for (Variant v : all(processed)) {
            String key = MediaStorageService.key(spaceId, mediaId, v.name());
            storage.put(key, v.bytes(), v.mime());
            byte[] stored = storage.get(key);
            assertThat(stored).as(v.name()).isEqualTo(v.bytes());
            assertThat(hasGps(stored)).as(v.name() + " GPS").isFalse();
            assertThat(hasExif(stored)).as(v.name() + " EXIF").isFalse();
        }
        assertThat(storage.deletePrefix(MediaStorageService.spacePrefix(spaceId))).isEqualTo(4);
    }

    @Test
    @DisplayName("AC-172 4000 px зураг → анхны ≤ 2560, sm 320 · md 960 · lg 1920 ба blurhash")
    void variantsAndBlurhash() throws Exception {
        ProcessedImage processed = processor.process(jpegWithGps(4000, 3000, 1));

        assertThat(processed.width()).isEqualTo(2560);
        assertThat(processed.height()).isEqualTo(1920);
        Map<String, int[]> sizes = processed.variants().stream()
                .collect(Collectors.toMap(Variant::name, v -> new int[] {v.width(), v.height()}));
        assertThat(sizes).containsOnlyKeys("sm", "md", "lg");
        assertThat(sizes.get("sm")).containsExactly(320, 240);
        assertThat(sizes.get("md")).containsExactly(960, 720);
        assertThat(sizes.get("lg")).containsExactly(1920, 1440);
        for (Variant v : processed.variants()) {
            BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(v.bytes()));
            assertThat(new int[] {decoded.getWidth(), decoded.getHeight()}).containsExactly(v.width(), v.height());
        }
        // 4×3 компонент: 1 (хэмжээ) + 1 (max) + 4 (DC) + 11×2 (AC) = 28 тэмдэгт
        assertThat(processed.blurhash()).isNotBlank().hasSize(28);
    }

    @Test
    @DisplayName("AC-172 жижиг зургийг томсгохгүй")
    void noUpscale() throws Exception {
        ProcessedImage processed = processor.process(jpegWithGps(300, 200, 1));
        assertThat(all(processed)).allSatisfy(v -> assertThat(new int[] {v.width(), v.height()}).containsExactly(300, 200));
    }

    @Test
    @DisplayName("AC-129 EXIF orientation=6 → пикселд шингэж (босоо), metadata хасагдана")
    void orientationApplied() throws Exception {
        ProcessedImage processed = processor.process(jpegWithGps(400, 200, 6));
        assertThat(processed.width()).isEqualTo(200);
        assertThat(processed.height()).isEqualTo(400);
        BufferedImage out = ImageIO.read(new ByteArrayInputStream(processed.original().bytes()));
        // Цагаан дөрвөлжин зүүн дээд буланд байсан → 90° цагийн зүүний дагуу эргүүлэхэд баруун дээд буланд
        Color topRight = new Color(out.getRGB(out.getWidth() - 5, 5));
        Color topLeft = new Color(out.getRGB(5, 5));
        assertThat(topRight.getRed() + topRight.getGreen() + topRight.getBlue()).isGreaterThan(700);
        assertThat(topLeft.getRed() + topLeft.getGreen() + topLeft.getBlue()).isLessThan(700);
        assertThat(hasExif(processed.original().bytes())).isFalse();
    }
}

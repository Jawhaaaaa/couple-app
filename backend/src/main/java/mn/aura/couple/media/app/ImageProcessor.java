package mn.aura.couple.media.app;

import com.drew.imaging.ImageMetadataReader;
import com.drew.imaging.ImageProcessingException;
import com.drew.metadata.Metadata;
import com.drew.metadata.MetadataException;
import com.drew.metadata.exif.ExifIFD0Directory;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.List;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Зургийг серверт дахин кодлох (DD-AURA-014, AC-21, AC-172, AC-129).
 *
 * <ul>
 *   <li>Decode — JDK ImageIO + TwelveMonkeys (CMYK JPEG, WebP). HEIC-ийн цэвэр Java decoder
 *       байхгүй: client JPEG болгож илгээнэ, ирвэл 415.</li>
 *   <li>EXIF orientation-ийг пикселд шингээж, metadata-гүй JPEG болгоно — GPS EXIF 0.</li>
 *   <li>Анхны зураг урт тал ≤ 2560, хувилбар `sm` 320 · `md` 960 · `lg` 1920 (томсгохгүй).</li>
 *   <li>BlurHash 4×3.</li>
 * </ul>
 */
@Component
public class ImageProcessor {

    public static final String MIME = "image/jpeg";
    public static final int ORIGINAL_MAX = 2560;
    public static final List<VariantSpec> VARIANTS = List.of(
            new VariantSpec("sm", 320), new VariantSpec("md", 960), new VariantSpec("lg", 1920));
    /** Decompression bomb-оос хамгаална (≈ 50 MP). */
    static final long MAX_PIXELS = 50_000_000L;
    private static final float QUALITY = 0.85f;

    public record VariantSpec(String name, int longSide) {
    }

    public record Variant(String name, byte[] bytes, int width, int height) {
        public String mime() {
            return MIME;
        }
    }

    /** `original` — дахин кодолсон анхны зураг; `variants` — sm, md, lg. */
    public record ProcessedImage(Variant original, List<Variant> variants, String blurhash) {
        public int width() {
            return original.width();
        }

        public int height() {
            return original.height();
        }
    }

    public ProcessedImage process(byte[] input) {
        BufferedImage decoded = decode(input);
        BufferedImage upright = toRgb(applyOrientation(decoded, orientation(input)));
        BufferedImage original = fit(upright, ORIGINAL_MAX);
        Variant originalVariant = encode("original", original);
        List<Variant> variants = VARIANTS.stream()
                .map(spec -> encode(spec.name(), fit(original, spec.longSide())))
                .toList();
        String blurhash = Blurhash.encode(fit(original, 32), 4, 3);
        return new ProcessedImage(originalVariant, variants, blurhash);
    }

    private static BufferedImage decode(byte[] input) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (in == null || !readers.hasNext()) {
                throw forbidden();
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels > MAX_PIXELS) {
                    throw new ApiException(ErrorCode.MEDIA_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE);
                }
                return reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException api) {
                throw api;
            }
            throw forbidden();
        }
    }

    /** EXIF orientation (1–8); байхгүй бол 1. */
    static int orientation(byte[] input) {
        try {
            Metadata metadata = ImageMetadataReader.readMetadata(new ByteArrayInputStream(input));
            ExifIFD0Directory dir = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (dir != null && dir.containsTag(ExifIFD0Directory.TAG_ORIENTATION)) {
                return dir.getInt(ExifIFD0Directory.TAG_ORIENTATION);
            }
        } catch (ImageProcessingException | IOException | MetadataException | RuntimeException ignored) {
            // Metadata уншигдахгүй бол эргүүлэхгүй
        }
        return 1;
    }

    static BufferedImage applyOrientation(BufferedImage src, int orientation) {
        int w = src.getWidth();
        int h = src.getHeight();
        // (x, y) → (m00·x + m01·y + m02, m10·x + m11·y + m12)
        AffineTransform t = switch (orientation) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, w, 0);
            case 3 -> new AffineTransform(-1, 0, 0, -1, w, h);
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, h);
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
            case 6 -> new AffineTransform(0, 1, -1, 0, h, 0);
            case 7 -> new AffineTransform(0, -1, -1, 0, h, w);
            case 8 -> new AffineTransform(0, -1, 1, 0, 0, w);
            default -> null;
        };
        if (t == null) {
            return src;
        }
        boolean swap = orientation >= 5;
        BufferedImage out = new BufferedImage(swap ? h : w, swap ? w : h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, out.getWidth(), out.getHeight());
            g.drawImage(src, t, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    /** JPEG-д alpha байхгүй — тунгалаг хэсгийг цагаан дэвсгэр дээр буулгана. */
    private static BufferedImage toRgb(BufferedImage src) {
        if (src.getType() == BufferedImage.TYPE_INT_RGB) {
            return src;
        }
        BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, out.getWidth(), out.getHeight());
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(src, 0, 0, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    /** Урт талыг `longSide` хүртэл багасгана; жижиг зургийг томсгохгүй. */
    static BufferedImage fit(BufferedImage src, int longSide) {
        int w = src.getWidth();
        int h = src.getHeight();
        int max = Math.max(w, h);
        if (max <= longSide) {
            return src;
        }
        double scale = (double) longSide / max;
        int tw = Math.max(1, (int) Math.round(w * scale));
        int th = Math.max(1, (int) Math.round(h * scale));
        try {
            return Thumbnails.of(src).forceSize(tw, th).imageType(BufferedImage.TYPE_INT_RGB).asBufferedImage();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Metadata-гүй JPEG (зөвхөн JFIF) — EXIF, GPS, XMP, ICC бичигдэхгүй. */
    private static Variant encode(String name, BufferedImage image) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            throw new IllegalStateException("JPEG writer олдсонгүй");
        }
        ImageWriter writer = writers.next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ImageOutputStream out = ImageIO.createImageOutputStream(bytes)) {
            writer.setOutput(out);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(QUALITY);
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        } finally {
            writer.dispose();
        }
        return new Variant(name, bytes.toByteArray(), image.getWidth(), image.getHeight());
    }

    private static ApiException forbidden() {
        return new ApiException(ErrorCode.MEDIA_TYPE_FORBIDDEN, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
}

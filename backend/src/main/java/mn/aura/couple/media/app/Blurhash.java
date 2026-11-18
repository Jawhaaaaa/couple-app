package mn.aura.couple.media.app;

import java.awt.image.BufferedImage;

/**
 * BlurHash encoder (https://github.com/woltapp/blurhash, MIT алгоритм). Client зургийг ачаалахаас
 * өмнө бүдэг дүрс харуулна. Жижигрүүлсэн (≤ 64 px) зураг өгвөл хурдан.
 */
final class Blurhash {

    private static final String CHARS =
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";

    private Blurhash() {
    }

    static String encode(BufferedImage image, int componentsX, int componentsY) {
        if (componentsX < 1 || componentsX > 9 || componentsY < 1 || componentsY > 9) {
            throw new IllegalArgumentException("components 1..9");
        }
        int width = image.getWidth();
        int height = image.getHeight();
        int[] rgb = image.getRGB(0, 0, width, height, null, 0, width);
        double[][] factors = new double[componentsX * componentsY][3];
        for (int j = 0; j < componentsY; j++) {
            for (int i = 0; i < componentsX; i++) {
                double normalisation = (i == 0 && j == 0) ? 1 : 2;
                double r = 0;
                double g = 0;
                double b = 0;
                for (int x = 0; x < width; x++) {
                    double cx = Math.cos(Math.PI * i * x / width);
                    for (int y = 0; y < height; y++) {
                        double basis = normalisation * cx * Math.cos(Math.PI * j * y / height);
                        int p = rgb[y * width + x];
                        r += basis * srgbToLinear((p >> 16) & 0xff);
                        g += basis * srgbToLinear((p >> 8) & 0xff);
                        b += basis * srgbToLinear(p & 0xff);
                    }
                }
                double scale = 1.0 / (width * height);
                double[] f = factors[j * componentsX + i];
                f[0] = r * scale;
                f[1] = g * scale;
                f[2] = b * scale;
            }
        }

        StringBuilder hash = new StringBuilder();
        encode83(hash, (componentsX - 1) + (componentsY - 1) * 9, 1);

        double maximumValue;
        if (factors.length > 1) {
            double actualMax = 0;
            for (int k = 1; k < factors.length; k++) {
                for (double v : factors[k]) {
                    actualMax = Math.max(actualMax, Math.abs(v));
                }
            }
            int quantisedMax = (int) Math.max(0, Math.min(82, Math.floor(actualMax * 166 - 0.5)));
            maximumValue = (quantisedMax + 1) / 166.0;
            encode83(hash, quantisedMax, 1);
        } else {
            maximumValue = 1;
            encode83(hash, 0, 1);
        }

        encode83(hash, encodeDc(factors[0]), 4);
        for (int k = 1; k < factors.length; k++) {
            encode83(hash, encodeAc(factors[k], maximumValue), 2);
        }
        return hash.toString();
    }

    private static int encodeDc(double[] value) {
        return (linearToSrgb(value[0]) << 16) + (linearToSrgb(value[1]) << 8) + linearToSrgb(value[2]);
    }

    private static int encodeAc(double[] value, double maximumValue) {
        int r = quantAc(value[0], maximumValue);
        int g = quantAc(value[1], maximumValue);
        int b = quantAc(value[2], maximumValue);
        return r * 19 * 19 + g * 19 + b;
    }

    private static int quantAc(double v, double max) {
        return (int) Math.max(0, Math.min(18, Math.floor(signPow(v / max, 0.5) * 9 + 9.5)));
    }

    private static double signPow(double value, double exp) {
        return Math.copySign(Math.pow(Math.abs(value), exp), value);
    }

    private static double srgbToLinear(int value) {
        double v = value / 255.0;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }

    private static int linearToSrgb(double value) {
        double v = Math.max(0, Math.min(1, value));
        return v <= 0.0031308
                ? (int) (v * 12.92 * 255 + 0.5)
                : (int) ((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5);
    }

    private static void encode83(StringBuilder sb, int value, int length) {
        for (int i = 1; i <= length; i++) {
            int digit = (value / (int) Math.pow(83, length - i)) % 83;
            sb.append(CHARS.charAt(digit));
        }
    }
}

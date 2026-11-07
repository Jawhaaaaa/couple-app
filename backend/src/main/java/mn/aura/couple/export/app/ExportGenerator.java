package mn.aura.couple.export.app;

import java.nio.file.Path;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Экспортын нэг төрлийг үүсгэгч (`BOOK_PDF`, `ALBUM_ZIP` — дурсамж, `FULL` — бүх өгөгдөл). Домэйн бүр
 * өөрийн `app` давхаргад bean болгоно; `DataExportService` төрлөөр нь сонгоно.
 */
public interface ExportGenerator {

    record Request(UUID exportId, UUID userId, UUID spaceId, UUID groupId, LocalDate from, LocalDate to, String locale) {
    }

    /** Үүссэн файл (`dir`-д), хэрэглэгчид харагдах нэр, MIME. */
    record Output(Path file, String fileName, String contentType) {
    }

    String kind();

    Output generate(Request request, Path dir) throws Exception;
}

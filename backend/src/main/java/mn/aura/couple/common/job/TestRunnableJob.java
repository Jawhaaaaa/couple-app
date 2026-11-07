package mn.aura.couple.common.job;

/**
 * Хугацаат ажил (DD-AURA-010). `e2e` profile-д `POST /test/jobs/{name}/run` нь хуваарь
 * хүлээлгүй `runOnce()`-г дуудна (DD-AURA-011). Prod-д энэ интерфейс зөвхөн нэр өгнө.
 */
public interface TestRunnableJob {

    /** Гэрээний `jobName` (жишээ `letterDelivery`). */
    String name();

    /** Нэг удаа ажиллаж, боловсруулсан мөрийн тоог буцаана. */
    int runOnce();
}

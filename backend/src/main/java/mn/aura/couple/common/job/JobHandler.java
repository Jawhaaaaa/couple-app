package mn.aura.couple.common.job;

/** `job` хүснэгтийн нэг төрлийг гүйцэтгэгч (домэйн бүр өөрийн `app` давхаргад bean болгоно). */
public interface JobHandler {

    /** `job.type` (жишээ `VIDEO_TRANSCODE`). */
    String type();

    /** Амжилтгүй бол exception — `JobRunner` дахин оролдоно. */
    void handle(JobQueue.Job job) throws Exception;

    /** `MAX_ATTEMPTS`-ийн дараа бүрмөсөн бүтэлгүйтэв — эх объектыг FAILED болгох г.м. */
    default void onGiveUp(JobQueue.Job job, Exception cause) {
    }
}

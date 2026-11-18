-- DEV_TEST согог 2a: эхний chunk-ийн агуулга хориотой байснаас цуцлагдсан upload-ыг дуусгах/chunk илгээх
-- оролдлогод гэрээнд зарласан 415 `MEDIA_TYPE_FORBIDDEN`-ийг буцаахын тулд цуцалсан шалтгааныг хадгална.
-- NULL = хэрэглэгч цуцалсан эсвэл хугацаа дууссан (гэрээний 404 `NOT_FOUND`).
ALTER TABLE upload_session ADD COLUMN abort_reason varchar(40);

package mn.aura.couple.media.app;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import mn.aura.couple.common.config.AuraProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CompletedPart;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.S3Object;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * Медиа сан (S3 / SeaweedFS, DD-AURA-013). Bucket private; client зөвхөн presigned GET-ээр
 * (анхдагч 15 мин, sigv4) татна — хугацаа дууссан URL нь S3-аас 403 (AC-195).
 *
 * <p>Key: `spaces/{spaceId}/{mediaId}/{variant}` — хосыг устгахад `spaces/{spaceId}/` prefix-ээр
 * бүгдийг цэвэрлэнэ (INV-16). Presigner нь `aura.s3.public-endpoint` (утас хүрэх хаяг)-аар
 * гарын үсэг зурна: sigv4 нь host-ыг гарын үсэгт оруулдаг тул URL-ыг дараа нь солих боломжгүй.
 */
@Service
public class MediaStorageService implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(MediaStorageService.class);

    private final S3Client s3;
    private final S3Presigner presigner;
    private final String bucket;
    private final Duration presignTtl;

    public MediaStorageService(AuraProperties properties) {
        AuraProperties.S3 cfg = properties.s3();
        this.bucket = cfg.bucket();
        this.presignTtl = cfg.presignTtl();
        StaticCredentialsProvider credentials = StaticCredentialsProvider.create(
                AwsBasicCredentials.create(cfg.accessKey(), cfg.secretKey()));
        // chunkedEncodingEnabled(false): http endpoint дээр SDK `Content-Encoding: aws-chunked`-аар илгээдэг ба
        // SeaweedFS түүнийг объектын metadata болгон хадгалж буцаадаг — Safari (iPhone PWA) ийм зургийг
        // «bad Content-Encoding» гээд ачаалдаггүй (AC-219, T-94-д илэрсэн)
        S3Configuration s3Config = S3Configuration.builder().pathStyleAccessEnabled(cfg.pathStyle())
                .chunkedEncodingEnabled(false).build();
        Region region = Region.of(cfg.region());
        this.s3 = S3Client.builder()
                .endpointOverride(URI.create(cfg.endpoint()))
                .region(region)
                .credentialsProvider(credentials)
                .serviceConfiguration(s3Config)
                // SeaweedFS нь aws-chunked + CRC32 checksum-ийг бүрэн дэмждэггүй
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .build();
        this.presigner = S3Presigner.builder()
                .endpointOverride(URI.create(cfg.effectivePublicEndpoint()))
                .region(region)
                .credentialsProvider(credentials)
                .serviceConfiguration(s3Config)
                .build();
        ensureBucket();
    }

    public static String key(UUID spaceId, UUID mediaId, String variant) {
        return "spaces/" + spaceId + "/" + mediaId + "/" + variant;
    }

    public static String spacePrefix(UUID spaceId) {
        return "spaces/" + spaceId + "/";
    }

    /** Эхлэхэд bucket-ыг үүсгэнэ (LLD §4.5). */
    final void ensureBucket() {
        try {
            s3.headBucket(b -> b.bucket(bucket));
        } catch (NoSuchBucketException e) {
            createBucket();
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                createBucket();
            } else {
                throw e;
            }
        }
    }

    private void createBucket() {
        s3.createBucket(b -> b.bucket(bucket));
        log.info("S3 bucket үүсгэв: {}", bucket);
    }

    public void put(String key, byte[] bytes, String contentType) {
        s3.putObject(b -> b.bucket(bucket).key(key).contentType(contentType).contentLength((long) bytes.length),
                RequestBody.fromBytes(bytes));
    }

    /** Том файл (экспортын ZIP) — санах ойд ачаалахгүй. */
    public void putFile(String key, java.nio.file.Path file, String contentType) {
        s3.putObject(b -> b.bucket(bucket).key(key).contentType(contentType), RequestBody.fromFile(file));
    }

    public byte[] get(String key) {
        ResponseBytes<GetObjectResponse> bytes = s3.getObjectAsBytes(b -> b.bucket(bucket).key(key));
        return bytes.asByteArray();
    }

    public void delete(String key) {
        s3.deleteObject(b -> b.bucket(bucket).key(key));
    }

    /** Prefix-ийн доорх бүх объектыг устгана (хос purge — INV-16). Устгасан тоог буцаана. */
    public int deletePrefix(String prefix) {
        int deleted = 0;
        String token = null;
        do {
            ListObjectsV2Request.Builder req = ListObjectsV2Request.builder().bucket(bucket).prefix(prefix).maxKeys(1000);
            if (token != null) {
                req.continuationToken(token);
            }
            ListObjectsV2Response page = s3.listObjectsV2(req.build());
            List<ObjectIdentifier> ids = new ArrayList<>();
            for (S3Object o : page.contents()) {
                ids.add(ObjectIdentifier.builder().key(o.key()).build());
            }
            if (!ids.isEmpty()) {
                // DeleteObjects нь Content-MD5 шаарддаг тул нэг нэгээр нь (SeaweedFS-д найдвартай)
                for (ObjectIdentifier id : ids) {
                    delete(id.key());
                }
                deleted += ids.size();
            }
            token = Boolean.TRUE.equals(page.isTruncated()) ? page.nextContinuationToken() : null;
        } while (token != null);
        return deleted;
    }

    /** Resumable upload-ын S3 multipart эхлэл (DD-AURA-012) — S3-ийн upload ID. */
    public String createMultipart(String key, String contentType) {
        return s3.createMultipartUpload(b -> b.bucket(bucket).key(key).contentType(contentType)).uploadId();
    }

    /** Нэг хэсэг (part дугаар 1-ээс) — ETag буцаана. Сүүлийнхээс бусад нь ≥ 5 MiB байна (S3). */
    public String uploadPart(String key, String uploadId, int partNumber, byte[] bytes) {
        return s3.uploadPart(b -> b.bucket(bucket).key(key).uploadId(uploadId).partNumber(partNumber)
                .contentLength((long) bytes.length), RequestBody.fromBytes(bytes)).eTag();
    }

    /** `etags` нь part 1, 2, … дарааллаар. */
    public void completeMultipart(String key, String uploadId, List<String> etags) {
        List<CompletedPart> parts = new ArrayList<>();
        for (int i = 0; i < etags.size(); i++) {
            parts.add(CompletedPart.builder().partNumber(i + 1).eTag(etags.get(i)).build());
        }
        s3.completeMultipartUpload(b -> b.bucket(bucket).key(key).uploadId(uploadId)
                .multipartUpload(m -> m.parts(parts)));
    }

    public void abortMultipart(String key, String uploadId) {
        s3.abortMultipartUpload(b -> b.bucket(bucket).key(key).uploadId(uploadId));
    }

    public long size(String key) {
        return s3.headObject(b -> b.bucket(bucket).key(key)).contentLength();
    }

    /** Анхдагч хугацаатай (`aura.s3.presign-ttl`, 15 мин) presigned GET. */
    public URI presignGet(String key) {
        return presignGet(key, presignTtl);
    }

    public URI presignGet(String key, Duration ttl) {
        try {
            return presigner.presignGetObject(p -> p.signatureDuration(ttl)
                    .getObjectRequest(g -> g.bucket(bucket).key(key))).url().toURI();
        } catch (java.net.URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    public Duration presignTtl() {
        return presignTtl;
    }

    @Override
    public void destroy() {
        presigner.close();
        s3.close();
    }
}

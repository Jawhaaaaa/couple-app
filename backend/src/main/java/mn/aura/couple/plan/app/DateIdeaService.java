package mn.aura.couple.plan.app;

import java.math.BigDecimal;
import java.net.URI;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mn.aura.couple.api.model.DateIdea;
import mn.aura.couple.api.model.DateIdeaInput;
import mn.aura.couple.api.model.DateIdeaUpdate;
import mn.aura.couple.api.model.IdeaCategory;
import mn.aura.couple.api.model.IdeaSetting;
import mn.aura.couple.api.model.NullablePlace;
import mn.aura.couple.api.model.Place;
import mn.aura.couple.common.ApiException;
import mn.aura.couple.common.ErrorCode;
import mn.aura.couple.common.id.Ids;
import mn.aura.couple.common.space.SpaceContext;
import mn.aura.couple.common.time.TimeProvider;
import mn.aura.couple.couple.app.UserRefs;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Хосын болзооны санаа (FR-7.1, AC-179): гарчиг (заавал, ≤ 80), тайлбар, ангилал, төсөв ₮, газар, холбоос,
 * гэр/гадаа. Ангилал, гэр/гадаа, төсөв, текстээр шүүнэ. Зөвхөн зохиогч засна/устгана (403 `NOT_OWNER`),
 * `version` зөрвөл 409 + серверийн хувилбар (DD-AURA-016). `clientId`-аар idempotent (outbox).
 * Сангаас авах нь хуулбар (`library_id`), эх сан өөрчлөгдөхгүй (AC-99).
 */
@Service
public class DateIdeaService {

    /** `GET /ideas`-ийн шүүлт; null = шүүхгүй. */
    public record Filter(IdeaCategory category, IdeaSetting setting, Long maxBudget, String q) {
    }

    private static final String COLUMNS = "id, space_id, author_id, title, description, category, budget_mnt, "
            + "place_name, lat, lon, city, country_code, url, setting, library_id, version, created_at";

    private final NamedParameterJdbcTemplate jdbc;
    private final IdeaLibraryService library;
    private final UserRefs users;
    private final TimeProvider time;

    public DateIdeaService(NamedParameterJdbcTemplate jdbc, IdeaLibraryService library, UserRefs users,
                           TimeProvider time) {
        this.jdbc = jdbc;
        this.library = library;
        this.users = users;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public List<DateIdea> list(SpaceContext ctx, Filter f) {
        StringBuilder sql = new StringBuilder("SELECT " + COLUMNS + " FROM date_idea WHERE space_id = :space");
        MapSqlParameterSource p = new MapSqlParameterSource("space", ctx.spaceId());
        if (f.category() != null) {
            sql.append(" AND category = :category");
            p.addValue("category", f.category().getValue());
        }
        if (f.setting() != null) {
            sql.append(" AND setting = :setting");
            p.addValue("setting", f.setting().getValue());
        }
        if (f.maxBudget() != null) {
            sql.append(" AND (budget_mnt IS NULL OR budget_mnt <= :maxBudget)");
            p.addValue("maxBudget", f.maxBudget());
        }
        if (f.q() != null && !f.q().isBlank()) {
            sql.append(" AND (lower(title) LIKE :q OR lower(coalesce(description, '')) LIKE :q)");
            p.addValue("q", "%" + f.q().strip().toLowerCase(Locale.ROOT).replace("%", "\\%").replace("_", "\\_") + "%");
        }
        sql.append(" ORDER BY created_at DESC, id");
        return toDtos(jdbc.query(sql.toString(), p, DateIdeaService::row));
    }

    @Transactional(readOnly = true)
    public DateIdea get(SpaceContext ctx, UUID id) {
        return toDto(visible(ctx, id));
    }

    /** Хосын санаанаас ID-аар (deck, болзооны `ideaId`) — өөр space-ийнх бол хоосон. */
    @Transactional(readOnly = true)
    public Optional<DateIdea> find(UUID spaceId, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM date_idea WHERE id = :id AND space_id = :space",
                new MapSqlParameterSource("id", id).addValue("space", spaceId), DateIdeaService::row)
                .stream().findFirst().map(this::toDto);
    }

    /** Хосын бүх санаа (санамсаргүй сонголт ба deck-ийн бүрдэл). */
    @Transactional(readOnly = true)
    public List<DateIdea> all(UUID spaceId) {
        return toDtos(jdbc.query("SELECT " + COLUMNS + " FROM date_idea WHERE space_id = :space ORDER BY created_at, id",
                new MapSqlParameterSource("space", spaceId), DateIdeaService::row));
    }

    @Transactional
    public DateIdea create(SpaceContext ctx, DateIdeaInput in) {
        Optional<Row> existing = byClient(ctx.userId(), in.getClientId());
        if (existing.isPresent()) {
            return toDto(existing.get()); // outbox-оос давтан (DD-AURA-017)
        }
        String title = requireTitle(in.getTitle());
        UUID id = Ids.newId();
        MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("space", ctx.spaceId())
                .addValue("author", ctx.userId()).addValue("client", in.getClientId()).addValue("title", title)
                .addValue("description", blankToNull(in.getDescription())).addValue("category", in.getCategory().getValue())
                .addValue("budget", in.getBudgetMnt()).addValue("url", in.getUrl() == null ? null : in.getUrl().toString())
                .addValue("setting", in.getSetting() == null ? null : in.getSetting().getValue())
                .addValue("library", null).addValue("now", Timestamp.from(time.now()));
        place(p, in.getPlace());
        try {
            insert(p);
        } catch (DuplicateKeyException e) {
            return toDto(byClient(ctx.userId(), in.getClientId()).orElseThrow(() -> e));
        }
        return get(ctx, id);
    }

    @Transactional
    public DateIdea update(SpaceContext ctx, UUID id, DateIdeaUpdate in) {
        Row cur = owned(ctx, id);
        if (in.getVersion() == null || in.getVersion() != cur.version()) {
            DateIdea current = toDto(cur);
            throw new ApiException(ErrorCode.VERSION_CONFLICT, HttpStatus.CONFLICT,
                    Map.of("current", current, "updatedBy", current.getAuthor().getDisplayName()));
        }
        List<String> sets = new ArrayList<>();
        MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("now", Timestamp.from(time.now()));
        if (in.getTitle() != null) {
            sets.add("title = :title");
            p.addValue("title", requireTitle(in.getTitle()));
        }
        if (in.getDescription() != null) {
            sets.add("description = :description");
            p.addValue("description", blankToNull(in.getDescription()));
        }
        if (in.getCategory() != null) {
            sets.add("category = :category");
            p.addValue("category", in.getCategory().getValue());
        }
        if (in.getBudgetMnt() != null) {
            sets.add("budget_mnt = :budget");
            p.addValue("budget", in.getBudgetMnt());
        }
        if (in.getPlace() != null) {
            sets.add("place_name = :placeName, lat = :lat, lon = :lon, city = :city, country_code = :country");
            place(p, toPlace(in.getPlace()));
        }
        if (in.getUrl() != null) {
            sets.add("url = :url");
            p.addValue("url", in.getUrl().toString().isBlank() ? null : in.getUrl().toString());
        }
        if (in.getSetting() != null) {
            sets.add("setting = :setting");
            p.addValue("setting", in.getSetting().getValue());
        }
        sets.add("version = version + 1");
        sets.add("updated_at = :now");
        jdbc.update("UPDATE date_idea SET " + String.join(", ", sets) + " WHERE id = :id", p);
        return get(ctx, id);
    }

    @Transactional
    public void delete(SpaceContext ctx, UUID id) {
        owned(ctx, id);
        jdbc.update("DELETE FROM date_idea WHERE id = :id", new MapSqlParameterSource("id", id));
    }

    /** Сангийн санааг хосын жагсаалтад хуулна (AC-99). Нэг space-д нэг хуулбар — давтан дуудвал түүнийг. */
    @Transactional
    public DateIdea adopt(SpaceContext ctx, String libraryId, String locale) {
        IdeaLibraryService.Item item = library.find(libraryId).orElseThrow(ApiException::notFound);
        List<Row> existing = jdbc.query("SELECT " + COLUMNS + " FROM date_idea WHERE space_id = :space "
                        + "AND library_id = :library ORDER BY created_at LIMIT 1",
                new MapSqlParameterSource("space", ctx.spaceId()).addValue("library", libraryId), DateIdeaService::row);
        if (!existing.isEmpty()) {
            return toDto(existing.get(0));
        }
        UUID id = Ids.newId();
        MapSqlParameterSource p = new MapSqlParameterSource("id", id).addValue("space", ctx.spaceId())
                .addValue("author", ctx.userId()).addValue("client", Ids.newId())
                .addValue("title", truncate(item.title(locale), 80)).addValue("description", item.description(locale))
                .addValue("category", item.category().getValue())
                .addValue("budget", item.band() == mn.aura.couple.api.model.BudgetBand.OVER_150_K ? null
                        : IdeaLibraryService.upperBound(item.band()))
                .addValue("url", null).addValue("setting", item.setting().getValue()).addValue("library", libraryId)
                .addValue("now", Timestamp.from(time.now()));
        place(p, null);
        insert(p);
        return get(ctx, id);
    }

    /**
     * Шүүлтэд тохирох санаанаас санамсаргүй нэг (AC-98). `includeLibrary` бол сангийнх (хэрэглэгчийн хэлээр)
     * нэмэгдэнэ — хосын жагсаалтад аль хэдийн хуулагдсан сангийн санаа давхардахгүй.
     */
    @Transactional(readOnly = true)
    public Optional<RandomIdeaPicker.Pick> random(SpaceContext ctx, RandomIdeaPicker.Criteria criteria,
                                                  boolean includeLibrary, RandomIdeaPicker picker) {
        List<RandomIdeaPicker.Candidate> all = new ArrayList<>();
        java.util.Set<String> adopted = new java.util.HashSet<>();
        for (DateIdea d : all(ctx.spaceId())) {
            all.add(new RandomIdeaPicker.Candidate(d, d.getCategory(), d.getSetting(), d.getBudgetMnt()));
            if (d.getLibraryId() != null) {
                adopted.add(d.getLibraryId());
            }
        }
        if (includeLibrary) {
            String locale = locale(ctx.userId());
            for (IdeaLibraryService.Item i : library.items()) {
                if (!adopted.contains(i.id())) {
                    all.add(new RandomIdeaPicker.Candidate(library.toDto(i, locale), i.category(), i.setting(),
                            IdeaLibraryService.upperBound(i.band())));
                }
            }
        }
        return picker.pick(all, criteria);
    }

    /** Хэрэглэгчийн хэл (`users.locale`) — сангийн бичвэрт. */
    @Transactional(readOnly = true)
    public String locale(UUID userId) {
        return jdbc.queryForList("SELECT locale FROM users WHERE id = :id", new MapSqlParameterSource("id", userId),
                String.class).stream().findFirst().orElse("mn");
    }

    private void insert(MapSqlParameterSource p) {
        jdbc.update("""
                INSERT INTO date_idea (id, space_id, author_id, client_id, title, description, category, budget_mnt,
                    place_name, lat, lon, city, country_code, url, setting, library_id, created_at, updated_at)
                VALUES (:id, :space, :author, :client, :title, :description, :category, :budget, :placeName, :lat, :lon,
                    :city, :country, :url, :setting, :library, :now, :now)
                """, p);
    }

    private Row visible(SpaceContext ctx, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM date_idea WHERE id = :id",
                        new MapSqlParameterSource("id", id), DateIdeaService::row).stream()
                .filter(r -> r.spaceId().equals(ctx.spaceId())).findFirst().orElseThrow(ApiException::notFound);
    }

    private Row owned(SpaceContext ctx, UUID id) {
        Row r = visible(ctx, id);
        if (!r.authorId().equals(ctx.userId())) {
            throw new ApiException(ErrorCode.NOT_OWNER, HttpStatus.FORBIDDEN);
        }
        return r;
    }

    private Optional<Row> byClient(UUID author, UUID clientId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM date_idea WHERE author_id = :a AND client_id = :c",
                new MapSqlParameterSource("a", author).addValue("c", clientId), DateIdeaService::row).stream().findFirst();
    }

    private static String requireTitle(String title) {
        String t = title == null ? "" : title.strip();
        if (t.isEmpty()) {
            throw ApiException.validation("title", ErrorCode.VALIDATION_FAILED);
        }
        return t;
    }

    record Row(UUID id, UUID spaceId, UUID authorId, String title, String description, String category, Long budget,
               String placeName, Double lat, Double lon, String city, String countryCode, String url, String setting,
               String libraryId, long version, OffsetDateTime createdAt) {
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        return new Row(rs.getObject("id", UUID.class), rs.getObject("space_id", UUID.class),
                rs.getObject("author_id", UUID.class), rs.getString("title"), rs.getString("description"),
                rs.getString("category"), (Long) rs.getObject("budget_mnt"), rs.getString("place_name"),
                (Double) rs.getObject("lat"), (Double) rs.getObject("lon"), rs.getString("city"),
                rs.getString("country_code"), rs.getString("url"), rs.getString("setting"), rs.getString("library_id"),
                rs.getLong("version"), OffsetDateTime.ofInstant(rs.getTimestamp("created_at").toInstant(), ZoneOffset.UTC));
    }

    private List<DateIdea> toDtos(List<Row> rows) {
        var refs = users.refs(rows.stream().map(Row::authorId).distinct().toList());
        return rows.stream().map(r -> toDto(r, refs.get(r.authorId()))).toList();
    }

    private DateIdea toDto(Row r) {
        return toDto(r, users.ref(r.authorId()));
    }

    private static DateIdea toDto(Row r, mn.aura.couple.api.model.UserRef author) {
        DateIdea d = new DateIdea(r.id(), r.title(), IdeaCategory.fromValue(r.category()), author, r.createdAt(),
                r.version());
        d.description(r.description());
        d.budgetMnt(r.budget());
        d.place(nullablePlace(r.placeName(), r.lat(), r.lon(), r.city(), r.countryCode()));
        d.url(r.url() == null ? null : URI.create(r.url()));
        d.setting(r.setting() == null ? null : IdeaSetting.fromValue(r.setting()));
        d.libraryId(r.libraryId());
        return d;
    }

    static NullablePlace nullablePlace(String name, Double lat, Double lon, String city, String country) {
        if (name == null || lat == null || lon == null) {
            return null;
        }
        NullablePlace p = new NullablePlace(name, BigDecimal.valueOf(lat), BigDecimal.valueOf(lon));
        p.city(city);
        p.countryCode(country == null ? null : country.strip());
        return p;
    }

    static Place toPlace(NullablePlace n) {
        if (n == null) {
            return null;
        }
        Place p = new Place(n.getName(), n.getLat(), n.getLon());
        p.city(n.getCity());
        p.countryCode(n.getCountryCode());
        return p;
    }

    static void place(MapSqlParameterSource p, Place loc) {
        p.addValue("placeName", loc == null ? null : loc.getName().strip())
                .addValue("lat", loc == null ? null : loc.getLat().doubleValue())
                .addValue("lon", loc == null ? null : loc.getLon().doubleValue())
                .addValue("city", loc == null ? null : loc.getCity())
                .addValue("country", loc == null ? null : loc.getCountryCode());
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static String truncate(String s, int max) {
        return s.codePointCount(0, s.length()) <= max ? s : s.substring(0, s.offsetByCodePoints(0, max));
    }
}

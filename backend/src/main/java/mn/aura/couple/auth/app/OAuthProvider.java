package mn.aura.couple.auth.app;

import java.net.URI;

/** OAuth/OIDC provider (`google`, `apple`). Идэвхгүй бол `start` 404 `PROVIDER_DISABLED`. */
public interface OAuthProvider {

    /** Гэрээний `provider` замын утга (`google`, `apple`). */
    String id();

    /** `oauth_identity.provider` (`GOOGLE`, `APPLE`). */
    String code();

    boolean enabled();

    URI authorizationUri(String state, String redirectUri);

    /** Callback-ийн `code`-ийг токеноор солиод `id_token`-ийг шалгана. */
    OAuthUser exchange(String code, String redirectUri);

    /** IdP-ийн баталгаажуулсан хэрэглэгч. */
    record OAuthUser(String provider, String subject, String email, boolean emailVerified, String name) {
        @Override
        public String toString() {
            return "OAuthUser[provider=" + provider + ", subject=***, email=***]";
        }
    }
}

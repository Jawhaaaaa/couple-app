package mn.aura.couple.account.api;

import mn.aura.couple.account.app.PolicyVersionService;
import mn.aura.couple.api.PoliciesApi;
import mn.aura.couple.api.model.Locale;
import mn.aura.couple.api.model.PolicyDocument;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

/** Гэрээний `Policies` tag (`x-aura-scope: public`): S-90 ба S-81-ийн бодлого, нөхцөл (AC-63, AC-130). */
@RestController
public class PoliciesController implements PoliciesApi {

    private final PolicyVersionService policies;

    public PoliciesController(PolicyVersionService policies) {
        this.policies = policies;
    }

    @Override
    public ResponseEntity<PolicyDocument> getCurrentPolicy(Locale locale) {
        return ResponseEntity.ok(policies.current(locale));
    }
}

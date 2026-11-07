import { maskBirthDateInput } from '@/auth/birthDate';
import { useT } from '@/i18n';

import { TextField } from '../TextField';

interface Props {
  value: string;
  onChange: (masked: string) => void;
  error?: string | null;
  editable?: boolean;
}

/**
 * Төрсөн огноо `ОООО.СС.ӨӨ` (FR-1.1): цифр бичихэд цэг өөрөө нэмэгдэнэ. 18+
 * шалгалтыг (`birthDateIssue`) эцэг дэлгэц хийж `error`-оор дамжуулна (AC-04).
 */
export function BirthDateField({ value, onChange, error, editable }: Props) {
  const t = useT();
  return (
    <TextField
      label={t('auth.fields.birthDate')}
      placeholder={t('auth.fields.birthDatePlaceholder')}
      value={value}
      onChangeText={(raw) => onChange(maskBirthDateInput(raw))}
      keyboardType="number-pad"
      inputMode="numeric"
      maxLength={10}
      autoComplete="birthdate-full"
      error={error}
      editable={editable}
      testID="register-birthdate"
    />
  );
}

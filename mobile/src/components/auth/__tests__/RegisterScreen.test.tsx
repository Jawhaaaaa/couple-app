import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { fetchCurrentPolicy, register } from '@/api/queries/auth';
import RegisterScreen from '@/app/(auth)/register';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/auth/device', () => ({
  deviceTimezone: () => 'Asia/Ulaanbaatar',
  deviceInfo: () => ({ name: 'test', platform: 'IOS' }),
}));

jest.mock('@/api/queries/auth', () => ({
  fetchCurrentPolicy: jest.fn(async () => ({
    version: '2026-11-01',
    publishedAt: '2026-11-01T00:00:00Z',
    privacyMarkdown: 'Нууцлал',
    termsMarkdown: 'Нөхцөл',
  })),
  register: jest.fn(async () => ({ accepted: true })),
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RegisterScreen />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

async function fillValidForm() {
  await fireEvent.changeText(screen.getByTestId('register-name'), 'Бат');
  await fireEvent.changeText(screen.getByTestId('register-email'), 'bat@aura.test');
  await fireEvent.changeText(screen.getByTestId('register-password'), 'Talbai-Nuur-2026');
  await fireEvent.changeText(screen.getByTestId('register-birthdate'), '19980514');
}

beforeEach(() => {
  usePrefsStore.setState({ ...defaultPrefs });
  jest.clearAllMocks();
});

describe('S-04 Бүртгүүлэх', () => {
  it('AC-63 бодлогыг зөвшөөрөөгүй бол «Бүртгүүлэх» идэвхгүй, зөвшөөрвөл идэвхтэй', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('policy-checkbox')).toBeEnabled());
    await fillValidForm();

    const submit = screen.getByTestId('register-submit');
    expect(submit).toBeDisabled();
    await fireEvent.press(submit);
    expect(register).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('policy-checkbox'));
    expect(screen.getByTestId('policy-checkbox')).toBeChecked();
    expect(screen.getByTestId('register-submit')).toBeEnabled();

    await fireEvent.press(screen.getByTestId('register-submit'));
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(register).toHaveBeenCalledWith({
      email: 'bat@aura.test',
      password: 'Talbai-Nuur-2026',
      displayName: 'Бат',
      birthDate: '1998-05-14',
      locale: 'mn',
      timezone: 'Asia/Ulaanbaatar',
      acceptedPolicyVersion: '2026-11-01',
    });
    expect(fetchCurrentPolicy).toHaveBeenCalledWith('mn');
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({ pathname: '/verify-email', params: { email: 'bat@aura.test', fresh: '1' } }),
    );
  });

  it('AC-63 бодлого ачаалагдаагүй бол зөвшөөрөх боломжгүй', async () => {
    jest.mocked(fetchCurrentPolicy).mockImplementationOnce(() => new Promise(() => {}));
    await renderScreen();
    expect(screen.getByTestId('policy-checkbox')).toBeDisabled();
    expect(screen.getByTestId('register-submit')).toBeDisabled();
  });

  it('AC-04 18 хүрээгүй огноонд «Aura нь 18+ хүмүүст зориулагдсан», илгээхгүй', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('policy-checkbox')).toBeEnabled());
    await fillValidForm();
    await fireEvent.changeText(screen.getByTestId('register-birthdate'), '20991231');
    expect(screen.getByTestId('register-birthdate')).toHaveDisplayValue('2099.12.31');
    expect(screen.getByText('Ийм огноо байхгүй байна. Дахин шалгаарай.')).toBeTruthy();

    const year = new Date().getFullYear() - 10;
    await fireEvent.changeText(screen.getByTestId('register-birthdate'), `${year}0101`);
    expect(screen.getByText('Aura нь 18+ хүмүүст зориулагдсан.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('policy-checkbox'));
    await fireEvent.press(screen.getByTestId('register-submit'));
    expect(register).not.toHaveBeenCalled();
  });

  it('AC-164 сул ба түгээмэл нууц үгийн шалтгааныг харуулж илгээхгүй', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('policy-checkbox')).toBeEnabled());
    await fillValidForm();

    await fireEvent.changeText(screen.getByTestId('register-password'), '1234567');
    expect(screen.getByTestId('password-issue')).toHaveTextContent('Хамгийн багадаа 8 тэмдэгт байх ёстой.');

    await fireEvent.changeText(screen.getByTestId('register-password'), 'password1');
    expect(screen.getByTestId('password-issue')).toHaveTextContent('Энэ нууц үг хэт түгээмэл байна. Өөрийг сонгоорой.');

    await fireEvent.press(screen.getByTestId('policy-checkbox'));
    await fireEvent.press(screen.getByTestId('register-submit'));
    expect(register).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('register-password'), 'Talbai-Nuur-2026');
    expect(screen.queryByTestId('password-issue')).toBeNull();
    expect(screen.getByTestId('password-level')).toHaveTextContent('Нууц үгийн хүч: Хүчтэй');
  });
});

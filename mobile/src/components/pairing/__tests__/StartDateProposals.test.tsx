import { fireEvent, render, screen } from '@testing-library/react-native';

import { startDateView } from '@/pairing/startDate';
import { defaultPrefs, usePrefsStore } from '@/stores/prefsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { StartDateProposals } from '../StartDateProposals';

beforeEach(() => usePrefsStore.setState({ ...defaultPrefs }));

function renderView(couple: Parameters<typeof startDateView>[0], onAccept = jest.fn()) {
  return render(
    <ThemeProvider>
      <StartDateProposals view={startDateView(couple)} partnerName="Ану" dateFormat="YMD_DOT" onAccept={onAccept} />
    </ThemeProvider>,
  );
}

describe('AC-65 S-11 эхэлсэн өдрийн зөрүү', () => {
  it('AC-65 A 2024-10-24, B 2024-10-25 → хоёр огноо зэрэгцэн харагдаж, хамтрагчийнхыг сонгож болно', async () => {
    const onAccept = jest.fn();
    await renderView(
      { startDate: null, startDateStatus: 'MISMATCH', myProposal: '2024-10-24', partnerProposal: '2024-10-25' },
      onAccept,
    );
    expect(screen.getByTestId('start-date-mismatch')).toBeTruthy();
    expect(screen.getByText('Огноо зөрж байна')).toBeTruthy();
    expect(screen.getByTestId('start-date-mine')).toHaveTextContent(/2024\.10\.24/);
    expect(screen.getByTestId('start-date-theirs')).toHaveTextContent(/Ану-ийн санал/);
    expect(screen.getByTestId('start-date-theirs')).toHaveTextContent(/2024\.10\.25/);

    await fireEvent.press(screen.getByTestId('start-date-pick-partner'));
    expect(onAccept).toHaveBeenCalledWith('2024-10-25');
  });

  it('AC-65 хамтрагч л санал болгосон бол батлах товч', async () => {
    const onAccept = jest.fn();
    await renderView({ startDate: null, startDateStatus: 'PENDING', myProposal: null, partnerProposal: '2024-10-25' }, onAccept);
    expect(screen.getByText('Ану 2024.10.25 гэж санал болгосон.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('start-date-accept'));
    expect(onAccept).toHaveBeenCalledWith('2024-10-25');
  });

  it('AC-65 өөрийн санал хамтрагчийг хүлээж, батлагдсан бол огноо', async () => {
    await renderView({ startDate: null, startDateStatus: 'PENDING', myProposal: '2024-10-24', partnerProposal: null });
    expect(screen.getByTestId('start-date-waiting')).toHaveTextContent('Чиний санал: 2024.10.24. Ану батлахыг хүлээж байна.');
    await screen.rerender(
      <ThemeProvider>
        <StartDateProposals
          view={startDateView({ startDate: '2024-10-24', startDateStatus: 'CONFIRMED', myProposal: '2024-10-24', partnerProposal: '2024-10-24' })}
          partnerName="Ану"
          dateFormat="YMD_DOT"
          onAccept={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('start-date-confirmed')).toHaveTextContent(/Эхэлсэн өдөр: 2024\.10\.24/);
  });
});

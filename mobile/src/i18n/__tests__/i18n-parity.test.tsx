import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { usePrefsStore } from '@/stores/prefsStore';

import en from '../en.json';
import { useT } from '../index';
import mn from '../mn.json';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});
}

const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('AC-135 i18n түлхүүрийн тэнцүү байдал', () => {
  const fmn = flatten(mn as Tree);
  const fen = flatten(en as Tree);

  it('Монгол/Англи түлхүүр 100% тохирно', () => {
    const missingInEn = Object.keys(fmn).filter((k) => !(k in fen));
    const missingInMn = Object.keys(fen).filter((k) => !(k in fmn));
    expect({ missingInEn, missingInMn }).toEqual({ missingInEn: [], missingInMn: [] });
  });

  it('хоосон утга байхгүй', () => {
    const empty = [...Object.entries(fmn), ...Object.entries(fen)].filter(([, v]) => !v.trim()).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('{{placeholder}} хоёр хэлэнд ижил', () => {
    const diff = Object.keys(fmn).filter((k) => placeholders(fmn[k]).join() !== placeholders(fen[k] ?? '').join());
    expect(diff).toEqual([]);
  });

  it('хэл солиход дахин ачаалалгүй бичиг солигдоно', async () => {
    function Probe() {
      const t = useT();
      return <Text testID="tab">{t('tabs.memories')}</Text>;
    }
    await act(async () => usePrefsStore.getState().set({ locale: 'mn' }));
    await render(<Probe />);
    const node = screen.getByTestId('tab');
    expect(node).toHaveTextContent('Дурсамж');
    await act(async () => usePrefsStore.getState().set({ locale: 'en' }));
    expect(screen.getByTestId('tab')).toBe(node);
    expect(node).toHaveTextContent('Memories');
    await act(async () => usePrefsStore.getState().set({ locale: 'mn' }));
  });
});

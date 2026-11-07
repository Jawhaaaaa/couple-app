import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('smoke', () => {
  it('рендер ажиллана', async () => {
    await render(<Text>Aura</Text>);
    expect(screen.getByText('Aura')).toBeTruthy();
  });
});

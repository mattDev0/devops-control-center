import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TopList from '../components/spotify/TopList';

describe('TopList', () => {
  it('covers a row with meta and a row without, where the empty row renders the name and no meta element', () => {
    const items = [
      { id: '1', name: 'Artist With Meta', genres: ['indie', 'rock'] },
      { id: '2', name: 'Artist Without Meta', genres: [] },
    ];

    const { container } = render(
      <TopList
        items={items}
        loading={false}
        emptyMessage="No ranking yet"
        renderMeta={(item) => item.genres?.slice(0, 2).join(' · ')}
      />
    );

    expect(screen.getByText('Artist With Meta')).toBeInTheDocument();
    expect(screen.getByText('indie · rock')).toBeInTheDocument();
    expect(screen.getByText('Artist Without Meta')).toBeInTheDocument();

    const listItems = container.querySelectorAll('li');
    expect(listItems).toHaveLength(2);

    expect(listItems[0].querySelector('.truncate:not(.font-medium)')).toHaveTextContent('indie · rock');
    expect(listItems[1].querySelector('.truncate:not(.font-medium)')).toBeNull();
  });
});

import React from 'react';
import { Chip, type ChipProps } from '@mui/material';
import { ORDER_STATUS_COLORS, TABLE_STATUS_COLORS, DELIVERY_STATUS_COLORS } from '../theme/index';

type StatusType = 'order' | 'table' | 'delivery' | 'custom';

interface StatusBadgeProps extends Omit<ChipProps, 'color'> {
  status: string;
  type?: StatusType;
  colorMap?: Record<string, string>;
}

const COLOR_MAPS: Record<string, Record<string, string>> = {
  order: ORDER_STATUS_COLORS,
  table: TABLE_STATUS_COLORS,
  delivery: DELIVERY_STATUS_COLORS,
};

function formatLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status, type = 'order', colorMap, size = 'small', ...rest }: StatusBadgeProps) {
  const map = colorMap ?? COLOR_MAPS[type] ?? {};
  const bg = map[status] ?? '#9E9E9E';

  return (
    <Chip
      label={formatLabel(status)}
      size={size}
      sx={{
        bgcolor: bg,
        color: '#fff',
        fontWeight: 600,
        fontSize: '0.75rem',
        ...rest.sx,
      }}
      {...rest}
    />
  );
}

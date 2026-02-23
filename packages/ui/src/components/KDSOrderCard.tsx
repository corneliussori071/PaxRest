import React from 'react';
import { Card, CardContent, Typography, Box, Chip, Divider, IconButton } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimerIcon from '@mui/icons-material/Timer';

interface KDSItem {
  id: string;
  name: string;
  quantity: number;
  modifiers?: string[];
  notes?: string;
  status: string;
}

interface KDSOrderCardProps {
  orderNumber: number;
  orderType: string;
  tableName?: string;
  customerName?: string;
  items: KDSItem[];
  createdAt: string;
  elapsedMinutes: number;
  onBump?: () => void;
  onItemReady?: (itemId: string) => void;
  urgentThresholdMinutes?: number;
}

export function KDSOrderCard({
  orderNumber, orderType, tableName, customerName,
  items, createdAt, elapsedMinutes,
  onBump, onItemReady,
  urgentThresholdMinutes = 15,
}: KDSOrderCardProps) {
  const isUrgent = elapsedMinutes >= urgentThresholdMinutes;
  const allReady = items.every((i) => i.status === 'ready');

  return (
    <Card sx={{
      width: 280,
      borderTop: `4px solid ${isUrgent ? '#EF5350' : allReady ? '#66BB6A' : '#FFA726'}`,
      bgcolor: isUrgent ? '#FFF3E0' : allReady ? '#E8F5E9' : 'background.paper',
    }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" fontWeight={700}>#{orderNumber}</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <TimerIcon fontSize="small" color={isUrgent ? 'error' : 'action'} />
            <Typography variant="body2" fontWeight={600} color={isUrgent ? 'error' : 'text.secondary'}>
              {elapsedMinutes}m
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
          <Chip label={orderType.replace('_', ' ')} size="small" />
          {tableName && <Chip label={tableName} size="small" variant="outlined" />}
        </Box>
        {customerName && (
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            {customerName}
          </Typography>
        )}

        <Divider sx={{ my: 1 }} />

        {/* Items */}
        {items.map((item) => (
          <Box
            key={item.id}
            sx={{
              display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5,
              opacity: item.status === 'ready' ? 0.5 : 1,
              textDecoration: item.status === 'ready' ? 'line-through' : 'none',
            }}
          >
            <Typography variant="body2" fontWeight={700} sx={{ minWidth: 20 }}>
              {item.quantity}×
            </Typography>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
              {item.modifiers && item.modifiers.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {item.modifiers.join(', ')}
                </Typography>
              )}
              {item.notes && (
                <Typography variant="caption" color="warning.main" fontWeight={600} sx={{ display: 'block' }}>
                  ⚠ {item.notes}
                </Typography>
              )}
            </Box>
            {onItemReady && item.status !== 'ready' && (
              <IconButton size="small" onClick={() => onItemReady(item.id)} color="success">
                <CheckCircleIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}

        {/* Bump button */}
        {onBump && (
          <Box
            onClick={onBump}
            sx={{
              mt: 1.5, py: 1, textAlign: 'center', borderRadius: 1, cursor: 'pointer',
              bgcolor: allReady ? 'success.main' : 'primary.main', color: '#fff', fontWeight: 700,
              '&:hover': { opacity: 0.9 },
            }}
          >
            {allReady ? 'BUMP ✓' : 'BUMP'}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

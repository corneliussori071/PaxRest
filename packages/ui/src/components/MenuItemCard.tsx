import React from 'react';
import {
  Card, CardContent, CardMedia, Typography, Box,
  IconButton, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

interface MenuItemCardProps {
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  formatPrice: (n: number) => string;
  tags?: string[];
  available?: boolean;
  quantity?: number;
  onAdd?: () => void;
  onRemove?: () => void;
  onClick?: () => void;
  compact?: boolean;
}

export function MenuItemCard({
  name, description, price, imageUrl, formatPrice,
  tags, available = true, quantity = 0,
  onAdd, onRemove, onClick, compact = false,
}: MenuItemCardProps) {
  return (
    <Card
      sx={{
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        opacity: available ? 1 : 0.5,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s',
        '&:hover': onClick ? { boxShadow: 3 } : {},
      }}
      onClick={available ? onClick : undefined}
    >
      {imageUrl && (
        <CardMedia
          component="img"
          image={imageUrl}
          alt={name}
          sx={compact
            ? { width: 80, height: 80, objectFit: 'cover' }
            : { height: 140, objectFit: 'cover' }
          }
        />
      )}
      <CardContent sx={{ flex: 1, p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="body1" fontWeight={600} noWrap>{name}</Typography>
        {description && !compact && (
          <Typography variant="caption" color="text.secondary" sx={{
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {description}
          </Typography>
        )}
        {tags && tags.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {tags.map((t) => <Chip key={t} label={t} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />)}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="body1" fontWeight={700} color="primary">
            {formatPrice(price)}
          </Typography>
          {(onAdd || onRemove) && available && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {quantity > 0 && onRemove && (
                <>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="body2" fontWeight={700} sx={{ minWidth: 20, textAlign: 'center' }}>
                    {quantity}
                  </Typography>
                </>
              )}
              {onAdd && (
                <IconButton
                  size="small"
                  color="primary"
                  onClick={(e) => { e.stopPropagation(); onAdd(); }}
                  sx={{ bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

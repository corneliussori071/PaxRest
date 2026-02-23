import React from 'react';
import {
  Card, CardContent, Typography, Box, Skeleton,
} from '@mui/material';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label?: string };
  loading?: boolean;
  color?: string;
  onClick?: () => void;
}

export function StatCard({ title, value, subtitle, icon, trend, loading, color, onClick }: StatCardProps) {
  return (
    <Card
      sx={{ cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { boxShadow: 3 } : {} }}
      onClick={onClick}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>{title}</Typography>
            {loading ? (
              <Skeleton width={80} height={32} />
            ) : (
              <Typography variant="h4" fontWeight={700} color={color}>{value}</Typography>
            )}
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
            {trend && !loading && (
              <Typography
                variant="caption"
                sx={{ color: trend.value >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
              >
                {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label ?? ''}
              </Typography>
            )}
          </Box>
          {icon && (
            <Box sx={{ ml: 2, p: 1, borderRadius: 2, bgcolor: `${color ?? '#1B5E20'}15`, color: color ?? 'primary.main' }}>
              {icon}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

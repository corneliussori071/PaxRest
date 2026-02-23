import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

interface LoadingOverlayProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingOverlay({ message = 'Loading…', fullScreen = false }: LoadingOverlayProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        ...(fullScreen
          ? { position: 'fixed', inset: 0, bgcolor: 'rgba(255,255,255,0.85)', zIndex: 9999 }
          : { py: 8 }),
      }}
    >
      <CircularProgress />
      <Typography variant="body2" color="text.secondary">{message}</Typography>
    </Box>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      {icon && <Box sx={{ mb: 2, color: 'text.secondary', '& svg': { fontSize: 48 } }}>{icon}</Box>}
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{description}</Typography>}
      {action}
    </Box>
  );
}

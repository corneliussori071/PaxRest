'use client';
import React, { useEffect } from 'react';
import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { theme } from '@paxrest/ui';
import { Toaster } from 'react-hot-toast';
import CustomerHeader from '@/components/CustomerHeader';
import CustomerFooter from '@/components/CustomerFooter';
import BranchSelector from '@/components/BranchSelector';
import { useCustomerAuth } from '@/stores/customerAuth';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialize = useCustomerAuth((s) => s.initialize);

  // Restore customer session on page load
  useEffect(() => { initialize(); }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <title>PaxRest - Order Online</title>
      </head>
      <body>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Toaster position="top-center" />
          {/* Branch selection — blocks until a branch is chosen */}
          <BranchSelector />
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <CustomerHeader />
            <Box component="main" sx={{ flex: 1 }}>
              {children}
            </Box>
            <CustomerFooter />
          </Box>
        </ThemeProvider>
      </body>
    </html>
  );
}

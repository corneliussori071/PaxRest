import React, { useState, useCallback } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TableSortLabel, Paper, Box, Typography, CircularProgress,
  TextField, InputAdornment, IconButton,
} from '@mui/material';

export interface Column<T = any> {
  id: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  render?: (row: T) => React.ReactNode;
  accessor?: (row: T) => any;
}

export interface DataTableProps<T = any> {
  columns: Column<T>[];
  rows: T[];
  totalRows?: number;
  page?: number;
  pageSize?: number;
  loading?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onSortChange?: (column: string, dir: 'asc' | 'desc') => void;
  onRowClick?: (row: T) => void;
  rowKey?: (row: T) => string;
  emptyMessage?: string;
  dense?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearchChange?: (search: string) => void;
  toolbar?: React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({
  columns, rows, totalRows, page = 0, pageSize = 10, loading = false,
  sortBy, sortDir = 'asc', onPageChange, onPageSizeChange, onSortChange,
  onRowClick, rowKey, emptyMessage = 'No data found', dense = false,
  searchable = false, searchPlaceholder = 'Search…', onSearchChange, toolbar,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    onSearchChange?.(e.target.value);
  }, [onSearchChange]);

  const handleSort = (colId: string) => {
    const newDir = sortBy === colId && sortDir === 'asc' ? 'desc' : 'asc';
    onSortChange?.(colId, newDir);
  };

  const getKey = (row: T, i: number) => rowKey ? rowKey(row) : (row as any).id ?? i;
  const getCellValue = (col: Column<T>, row: T) => {
    if (col.render) return col.render(row);
    if (col.accessor) return col.accessor(row);
    return row[col.id] ?? '—';
  };

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      {(searchable || toolbar) && (
        <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          {searchable && (
            <TextField
              size="small"
              placeholder={searchPlaceholder}
              value={search}
              onChange={handleSearch}
              sx={{ minWidth: 240 }}
            />
          )}
          <Box sx={{ flex: 1 }} />
          {toolbar}
        </Box>
      )}

      <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
        <Table stickyHeader size={dense ? 'small' : 'medium'}>
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align ?? 'left'}
                  sx={{ width: col.width, whiteSpace: 'nowrap' }}
                >
                  {col.sortable !== false && onSortChange ? (
                    <TableSortLabel
                      active={sortBy === col.id}
                      direction={sortBy === col.id ? sortDir : 'asc'}
                      onClick={() => handleSort(col.id)}
                    >
                      {col.label}
                    </TableSortLabel>
                  ) : col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary">{emptyMessage}</Typography>
                </TableCell>
              </TableRow>
            ) : rows.map((row, i) => (
              <TableRow
                key={getKey(row, i)}
                hover={!!onRowClick}
                onClick={() => onRowClick?.(row)}
                sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                {columns.map((col) => (
                  <TableCell key={col.id} align={col.align ?? 'left'}>
                    {getCellValue(col, row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {onPageChange && (
        <TablePagination
          component="div"
          count={totalRows ?? rows.length}
          page={page}
          rowsPerPage={pageSize}
          onPageChange={(_, p) => onPageChange(p)}
          onRowsPerPageChange={(e) => onPageSizeChange?.(parseInt(e.target.value, 10))}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      )}
    </Paper>
  );
}

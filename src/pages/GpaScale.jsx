import { useEffect, useMemo, useState } from 'react';
import { Award, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';

function emptyRow() {
  return { min_mark: '', max_mark: '', points: '', letter: '' };
}

function lookup(rows, mark) {
  const value = Number(mark);
  if (!Number.isFinite(value)) return null;
  const match = rows.find((row) => {
    const min = Number(row.min_mark);
    const max = Number(row.max_mark);
    return Number.isFinite(min) && Number.isFinite(max) && value >= min && value <= max;
  });
  return match || null;
}

export default function GpaScale() {
  const { api, isViceDeanAcademic, isExamsOffice } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const endpoint = isViceDeanAcademic ? '/vda/gpa-scale' : '/exams/gpa-scale';
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState('97');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get(endpoint);
      setRows((res.data?.rows || []).length ? res.data.rows : [emptyRow()]);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل سلّم المعدل النقطي' : 'Failed to load the GPA scale'));
    }
  };

  useEffect(() => {
    if (isViceDeanAcademic || isExamsOffice) load();
  }, [api, endpoint, isViceDeanAcademic, isExamsOffice]);

  const previewRow = useMemo(() => lookup(rows, preview), [rows, preview]);

  const change = (index, patch) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.put(endpoint, { rows });
      setRows(res.data?.rows || []);
      toast.success(ar ? 'حُفظ سلّم المعدل النقطي للكلية' : 'College GPA scale saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر حفظ السلّم' : 'Failed to save the scale'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="gpa-scale-page">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="w-6 h-6" />
          {ar ? 'المعدل النقطي' : 'Point GPA scale'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'نائب العميد ودائرة الامتحانات يكتبان نفس سلّم الكلية: من علامة إلى علامة → نقاط + حرف. مثال: 97–100 = 4.00 A+، 95 = 3.75 A+، 90–94 = 3.50 A-.'
            : 'The vice dean and Exams Office edit the same college scale: mark range → points + letter. Example: 97–100 = 4.00 A+, 95 = 3.75 A+, 90–94 = 3.50 A-.'}
        </p>
      </div>

      <Card className="rounded-[2rem] max-w-sm" data-testid="gpa-scale-preview">
        <CardHeader>
          <CardTitle className="text-base">{ar ? 'معاينة علامة' : 'Preview a mark'}</CardTitle>
          <CardDescription>
            {previewRow
              ? `${Number(preview).toFixed(0)} → ${Number(previewRow.points).toFixed(2)} · ${previewRow.letter}`
              : (ar ? 'لا يوجد صف يغطي هذه العلامة بعد.' : 'No row covers this mark yet.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label>{ar ? 'علامة من 100' : 'Mark out of 100'}</Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            className="rounded-xl mt-1"
            data-testid="gpa-scale-preview-mark"
          />
        </CardContent>
      </Card>

      <Card className="rounded-[2rem]">
        <CardHeader>
          <CardTitle>{ar ? 'سلّم التحويل' : 'Conversion scale'}</CardTitle>
          <CardDescription>
            {ar
              ? 'كل صف يغطي نطاقاً من العلامات. لا تسمح بالتداخل. يُحفظ للكلية كلها.'
              : 'Each row covers a mark range. Overlaps are rejected. The scale is college-wide.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? 'من' : 'From'}</TableHead>
                    <TableHead>{ar ? 'إلى' : 'To'}</TableHead>
                    <TableHead>{ar ? 'النقاط' : 'Points'}</TableHead>
                    <TableHead>{ar ? 'الحرف' : 'Letter'}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={index} data-testid={`gpa-scale-row-${index}`}>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={row.min_mark}
                          onChange={(e) => change(index, { min_mark: e.target.value })}
                          className="rounded-xl w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={row.max_mark}
                          onChange={(e) => change(index, { max_mark: e.target.value })}
                          className="rounded-xl w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="4"
                          step="0.01"
                          value={row.points}
                          onChange={(e) => change(index, { points: e.target.value })}
                          className="rounded-xl w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.letter}
                          onChange={(e) => change(index, { letter: e.target.value })}
                          className="rounded-xl w-20"
                          maxLength={3}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-full"
                          disabled={rows.length <= 1}
                          onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                data-testid="gpa-scale-add-row"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
              >
                <Plus className="w-4 h-4 me-1" />
                {ar ? 'صف جديد' : 'Add row'}
              </Button>
              <Button type="submit" className="rounded-xl" disabled={busy} data-testid="gpa-scale-save">
                {ar ? 'حفظ السلّم للكلية' : 'Save scale for the college'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

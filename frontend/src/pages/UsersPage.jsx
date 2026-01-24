import { useMemo, useState } from 'react';
import {
  KeyRound,
  MoreHorizontal,
  Shield,
  UserCog,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

const defaultForm = {
  name: '',
  email: '',
  role: 'analyst',
  status: 'active',
  department: 'Network',
  title: 'SOC Analyst',
};

const roleStyles = {
  admin: 'bg-primary/10 text-primary border-primary/20',
  analyst: 'bg-warning/10 text-warning border-warning/20',
  viewer: 'bg-muted text-muted-foreground border-border',
};

const statusStyles = {
  active: 'bg-success/10 text-success border-success/20',
  suspended: 'bg-destructive/10 text-destructive border-destructive/20',
};

const formatDate = (value) => {
  if (!value) {
    return 'Never';
  }
  return new Date(value).toLocaleString();
};

export default function UsersPage() {
  const { user: currentUser, users, addUser, removeUser, toggleUserStatus, updateUser } = useAuth();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const filteredUsers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return users;
    }
    return users.filter((item) => (
      item.name.toLowerCase().includes(normalized)
      || item.email.toLowerCase().includes(normalized)
      || item.role.toLowerCase().includes(normalized)
      || item.status.toLowerCase().includes(normalized)
    ));
  }, [search, users]);

  const activeCount = users.filter((item) => item.status === 'active').length;
  const suspendedCount = users.filter((item) => item.status === 'suspended').length;

  const handleFormChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleAddUser = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await addUser(form);
      toast.success('User created.', {
        description: `Temp password: ${result.tempPassword}`,
      });
      setForm(defaultForm);
      setOpen(false);
    } catch (error) {
      toast.error('Unable to create user.', {
        description: error.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId, role) => {
    await updateUser(userId, { role });
    toast.success('Role updated.');
  };

  const handleToggleStatus = async (userId) => {
    await toggleUserStatus(userId);
    toast.success('User status updated.');
  };

  const handleResetPassword = async (target) => {
    const tempPassword = `Temp-${Math.random().toString(36).slice(2, 8)}!`;
    await updateUser(target.id, { password: tempPassword });
    toast.success('Temporary password issued.', {
      description: `Temp password: ${tempPassword}`,
    });
  };

  const handleRemoveUser = async (target) => {
    await removeUser(target.id);
    toast.success('User removed.');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage access, roles, and account status for the ElasticGuard workspace.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4" />
              Add user
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                Provision a new workspace account with a temporary password.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleAddUser}>
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={handleFormChange('name')}
                  placeholder="User name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={handleFormChange('email')}
                  placeholder="user@uy1.local"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={form.role}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, role: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="analyst">Analyst</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={form.department}
                    onChange={handleFormChange('department')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={handleFormChange('title')}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create user'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Total users</CardTitle>
            <CardDescription>All registered accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-foreground">{users.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Active</CardTitle>
            <CardDescription>Ready for operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-success">{activeCount}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Suspended</CardTitle>
            <CardDescription>Access temporarily revoked</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-destructive">{suspendedCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-soft">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base">Workspace users</CardTitle>
            <CardDescription>Manage roles and security posture</CardDescription>
          </div>
          <div className="w-full md:w-72">
            <Input
              placeholder="Search users"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((item) => {
                const isSelf = currentUser?.id === item.id;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('border', roleStyles[item.role] || '')}>
                        {item.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('border', statusStyles[item.status] || '')}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">{item.department}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground font-mono">{formatDate(item.lastLogin)}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => handleRoleChange(item.id, 'admin')}>
                            <Shield className="h-4 w-4" />
                            Set role: Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRoleChange(item.id, 'analyst')}>
                            <UserCog className="h-4 w-4" />
                            Set role: Analyst
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRoleChange(item.id, 'viewer')}>
                            <UserCog className="h-4 w-4" />
                            Set role: Viewer
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleToggleStatus(item.id)}
                            disabled={isSelf}
                          >
                            <UserMinus className="h-4 w-4" />
                            {item.status === 'active' ? 'Suspend user' : 'Activate user'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResetPassword(item)}>
                            <KeyRound className="h-4 w-4" />
                            Reset password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleRemoveUser(item)}
                            disabled={isSelf}
                          >
                            Remove user
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

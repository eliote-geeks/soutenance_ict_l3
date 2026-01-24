import { useEffect, useMemo, useState } from 'react';
import { KeyRound, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';

const getInitials = (name) => {
  if (!name) {
    return 'U';
  }
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

export default function ProfilePage() {
  const { user, updateProfile, updatePassword } = useAuth();
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    title: '',
    department: '',
    phone: '',
  });
  const [passwords, setPasswords] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [saving, setSaving] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    setProfile({
      name: user.name || '',
      email: user.email || '',
      title: user.title || '',
      department: user.department || '',
      phone: user.phone || '',
    });
  }, [user]);

  const initials = useMemo(() => getInitials(user?.name), [user?.name]);

  const handleProfileChange = (field) => (event) => {
    setProfile((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handlePasswordChange = (field) => (event) => {
    setPasswords((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateProfile(profile);
      toast.success('Profile updated.');
    } catch (error) {
      toast.error('Unable to update profile.', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async (event) => {
    event.preventDefault();
    if (passwords.next !== passwords.confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setUpdatingPassword(true);
    try {
      await updatePassword({ currentPassword: passwords.current, nextPassword: passwords.next });
      toast.success('Password updated.');
      setPasswords({ current: '', next: '', confirm: '' });
    } catch (error) {
      toast.error('Unable to update password.', { description: error.message });
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your personal access and security preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Profile details</CardTitle>
            <CardDescription>Keep your operator profile up to date.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 pb-6">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-lg font-semibold text-foreground">{user?.name}</div>
                <div className="text-sm text-muted-foreground">{user?.email}</div>
                <div className="mt-2">
                  <Badge className="bg-primary/10 text-primary border-primary/20">{user?.role}</Badge>
                </div>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSaveProfile}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={profile.name} onChange={handleProfileChange('name')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={profile.email} onChange={handleProfileChange('email')} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={profile.title} onChange={handleProfileChange('title')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input id="department" value={profile.department} onChange={handleProfileChange('department')} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={profile.phone} onChange={handleProfileChange('phone')} />
              </div>
              <Button type="submit" disabled={saving}>
                <User className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Security</CardTitle>
            <CardDescription>Update your credentials regularly.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleUpdatePassword}>
              <div className="space-y-2">
                <Label htmlFor="current">Current password</Label>
                <Input
                  id="current"
                  type="password"
                  value={passwords.current}
                  onChange={handlePasswordChange('current')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next">New password</Label>
                <Input
                  id="next"
                  type="password"
                  value={passwords.next}
                  onChange={handlePasswordChange('next')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={passwords.confirm}
                  onChange={handlePasswordChange('confirm')}
                  required
                />
              </div>
              <Button type="submit" variant="outline" disabled={updatingPassword}>
                <KeyRound className="h-4 w-4" />
                {updatingPassword ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

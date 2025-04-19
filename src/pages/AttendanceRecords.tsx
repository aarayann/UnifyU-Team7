import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Bar } from 'react-chartjs-2';
import { toast } from 'sonner';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription, 
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  XCircle,
  Search,
  CalendarDays,
  UserCircle,
  BookOpen,
} from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface AttendanceRecord {
  id: string;
  student_id: string;
  faculty_id: string;
  course_name: string;
  date: string;
  status: string;
  created_at: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

const AttendanceRecords = () => {
  const [userType, setUserType] = useState<'student' | 'faculty' | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [markingAttendance, setMarkingAttendance] = useState<Record<string, boolean>>({});
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'all'>('all');

  // Fetch unique subjects (course_name) from performance_metrics
  useEffect(() => {
    const fetchSubjects = async () => {
      const { data, error } = await supabase
        .from('performance_metrics')
        .select('course_name');
      if (error) {
        setSubjects([]);
      } else {
        const uniqueSubjects = Array.from(new Set((data || []).map((row: any) => row.course_name)));
        setSubjects(uniqueSubjects);
        setSelectedSubject(uniqueSubjects[0] || "");
      }
    };
    fetchSubjects();
  }, []);

  useEffect(() => {
    const checkUserType = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const { data: userData } = await supabase
        .from("login_users")
        .select("user_type")
        .eq("uid", user.id)
        .single();

      if (userData) {
        setUserType(userData.user_type as 'student' | 'faculty');
        if (userData.user_type === 'student') {
          fetchStudentAttendanceData(user.id);
        } else {
          fetchAllStudents();
          fetchFacultyAttendanceData(user.id);
        }
      }
    };

    checkUserType();
    // eslint-disable-next-line
  }, []);

  const fetchStudentAttendanceData = async (userId: string) => {
    setLoading(true);

    let query = supabase
      .from('daily_attendance')
      .select('*')
      .eq('student_id', userId);

    // Date filtering
    if (dateRange === 'week') {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      query = query.gte('date', lastWeek.toISOString().split('T')[0]);
    } else if (dateRange === 'month') {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      query = query.gte('date', lastMonth.toISOString().split('T')[0]);
    }

    // Subject filtering
    if (filterSubject !== 'all') {
      query = query.eq('course_name', filterSubject);
    }

    query = query.order('date', { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching attendance data:', error.message);
      toast.error('Failed to load attendance records');
    } else {
      setAttendanceData(data || []);
    }
    setLoading(false);
  };

  const fetchFacultyAttendanceData = async (userId: string) => {
    setLoading(true);

    let query = supabase
      .from('daily_attendance')
      .select('*')
      .eq('faculty_id', userId);

    if (dateRange === 'week') {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      query = query.gte('date', lastWeek.toISOString().split('T')[0]);
    } else if (dateRange === 'month') {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      query = query.gte('date', lastMonth.toISOString().split('T')[0]);
    }

    if (filterSubject !== 'all') {
      query = query.eq('course_name', filterSubject);
    }

    query = query.order('date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching faculty attendance data:', error.message);
      toast.error('Failed to load attendance records');
    } else {
      setAttendanceData(data || []);
    }

    setLoading(false);
  };

  const fetchAllStudents = async () => {
    const { data, error } = await supabase
      .from('login_users')
      .select('uid, name, email')
      .eq('user_type', 'student');

    if (error) {
      console.error('Error fetching students:', error.message);
    } else {
      setStudentsList(data?.map(s => ({
        id: s.uid,
        name: s.name,
        email: s.email,
      })) || []);
    }
  };

  // Corrected upsert implementation
  const markAttendance = async (studentId: string, status: 'present' | 'absent') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Faculty authentication failed');
  
      // Validate required fields
      if (!studentId || !selectedSubject || !selectedDate) {
        throw new Error('Missing required parameters');
      }
  
      const { error } = await supabase
  .from('daily_attendance')
  .upsert(
    {
      student_id: studentId,
      faculty_id: user.id,
      course_name: selectedSubject,
      date: selectedDate,
      status
    },
    { onConflict: 'student_id,course_name,date' }  // must match the unique index columns exactly
  );

  
      if (error) throw error;
      toast.success('Attendance updated successfully');
    } catch (error) {
      toast.error(error.message || 'Failed to update attendance');
    }
  };     
  

  const filteredData = attendanceData.filter(record =>
    record.course_name.toLowerCase().includes(filter.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getAttendanceStats = () => {
    const total = filteredData.length;
    const present = filteredData.filter(record => record.status === 'present').length;
    const absent = total - present;
    const percentage = total > 0 ? (present / total) * 100 : 0;

    return { total, present, absent, percentage: percentage.toFixed(2) };
  };

  const { total, present, absent, percentage } = getAttendanceStats();

  // Group data by subject for visualization
  const subjectStats = subjects.map(subject => {
    const subjectRecords = filteredData.filter(r => r.course_name === subject);
    const total = subjectRecords.length;
    const present = subjectRecords.filter(r => r.status === 'present').length;
    const percentage = total > 0 ? (present / total) * 100 : 0;

    return {
      name: subject,
      total,
      present,
      absent: total - present,
      percentage: percentage.toFixed(2)
    };
  }).filter(s => s.total > 0);

  const subjectChartData = {
    labels: subjectStats.map(s => s.name),
    datasets: [
      {
        label: 'Attendance %',
        data: subjectStats.map(s => parseFloat(s.percentage)),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Attendance Overview' },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
      },
    },
  };

  if (loading && !userType) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#244855]"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold text-[#244855] mb-6">Attendance Records</h1>
      
      <Tabs defaultValue={userType ?? ''}>
        <TabsList className="mb-6">
          <TabsTrigger value="student" disabled={userType !== 'student'}>Student View</TabsTrigger>
          <TabsTrigger value="faculty" disabled={userType !== 'faculty'}>Faculty View</TabsTrigger>
        </TabsList>
        
        <TabsContent value="student" className="space-y-6">
          {/* Student Attendance Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Attendance Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-bold">{total}</p>
                    <p className="text-sm text-gray-500">Total Classes</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{present}</p>
                    <p className="text-sm text-gray-500">Present</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{absent}</p>
                    <p className="text-sm text-gray-500">Absent</p>
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="flex justify-between mb-1">
                    <span>Attendance Rate</span>
                    <span className={parseFloat(percentage) >= 75 ? "text-green-600" : "text-red-600"}>
                      {percentage}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full ${parseFloat(percentage) >= 75 ? "bg-green-600" : "bg-red-600"}`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
                
                <div className="mt-4 text-xs text-gray-500">
                  {parseFloat(percentage) < 75 ? (
                    <p className="text-red-600">
                      ⚠️ Your attendance is below the required 75% threshold.
                    </p>
                  ) : (
                    <p className="text-green-600">
                      ✅ Your attendance meets the required threshold.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Subject-wise Attendance</CardTitle>
              </CardHeader>
              <CardContent>
                {subjectStats.length > 0 ? (
                  <Bar data={subjectChartData} options={chartOptions} />
                ) : (
                  <div className="text-center py-10 text-gray-500">
                    <p>No attendance data available for subjects</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Student Attendance Records */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Attendance Records</CardTitle>
                <CardDescription>View your complete attendance history</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select onValueChange={(value) => setDateRange(value as 'week' | 'month' | 'all')}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Filter by date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select onValueChange={setFilterSubject} defaultValue="all">
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Filter by subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subjects</SelectItem>
                    {subjects.map(subject => (
                      <SelectItem key={subject} value={subject}>
                        {subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by subject name..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#244855] mx-auto mb-4"></div>
                  <p>Loading attendance records...</p>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No attendance records found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell>
                            <div className="font-medium">{record.course_name}</div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              record.status === 'present'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {record.status === 'present' ? (
                                <>
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Present
                                </>
                              ) : (
                                <>
                                  <XCircle className="mr-1 h-3 w-3" />
                                  Absent
                                </>
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="faculty" className="space-y-6">
          {/* Faculty Attendance Marking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Mark Attendance
              </CardTitle>
              <CardDescription>Record attendance for students</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date</label>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map(subject => (
                        <SelectItem key={subject} value={subject}>
                          {subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentsList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-6 text-gray-500">
                          No students found
                        </TableCell>
                      </TableRow>
                    ) : (
                      studentsList.map(student => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <UserCircle className="h-5 w-5 text-gray-400" />
                              {student.name}
                            </div>
                          </TableCell>
                          <TableCell>{student.email}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex items-center gap-1 text-green-600 hover:text-green-700 border-green-200 hover:bg-green-50 hover:border-green-300"
                                onClick={() => markAttendance(student.id, 'present')}
                                disabled={markingAttendance[student.id]}
                              >
                                {markingAttendance[student.id] ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600"></div>
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                <span>Present</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex items-center gap-1 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 hover:border-red-300"
                                onClick={() => markAttendance(student.id, 'absent')}
                                disabled={markingAttendance[student.id]}
                              >
                                {markingAttendance[student.id] ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                                ) : (
                                  <XCircle className="h-3 w-3" />
                                )}
                                <span>Absent</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          
          {/* Faculty Attendance Records */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Recent Attendance Records
                </CardTitle>
                <CardDescription>View recently marked attendance records</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#244855] mx-auto mb-4"></div>
                  <p>Loading attendance records...</p>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No attendance records found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell>
                            {studentsList.find(s => s.id === record.student_id)?.name || "Unknown Student"}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{record.course_name}</div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              record.status === 'present'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {record.status === 'present' ? (
                                <>
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Present
                                </>
                              ) : (
                                <>
                                  <XCircle className="mr-1 h-3 w-3" />
                                  Absent
                                </>
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AttendanceRecords;

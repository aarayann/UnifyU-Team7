import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  Search,
  UserCircle,
  GraduationCap,
} from "lucide-react";

const ASSIGNMENTS = [
  { key: "assignments_score", label: "Assignments" },
  { key: "quizzes_score", label: "Quizzes" },
  { key: "exams_score", label: "Exams" },
];

interface Student {
  uid: string;
  name: string;
  email: string;
}

interface PerformanceMetric {
  id: string;
  uid: string;
  course_name: string;
  assignments_score: number;
  quizzes_score: number;
  exams_score: number;
  overall_grade: string;
  created_at: string;
  student_name?: string;
}

export default function GradeAssignments() {
  const [loading, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<PerformanceMetric[]>([]);
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [courses, setCourses] = useState<string[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedAssignment, setSelectedAssignment] = useState<string>(ASSIGNMENTS[0].key);
  const [gradingInProgress, setGradingInProgress] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCourse, setFilterCourse] = useState<string>('all');
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const initialize = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await fetchCourses();
      await fetchAllStudents();
      await fetchFacultyMetrics();
    };
    initialize();
  }, []);

  const fetchCourses = async () => {
    const { data } = await supabase
      .from('performance_metrics')
      .select('course_name');
    if (data) {
      const uniqueCourses = Array.from(new Set(data.map(row => row.course_name)));
      setCourses(uniqueCourses);
      setSelectedCourse(uniqueCourses[0] || "");
    }
  };

  const fetchFacultyMetrics = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('performance_metrics')
      .select('*');
    if (data) {
      const uids = Array.from(new Set(data.map(m => m.uid)));
      const { data: users } = await supabase
        .from('login_users')
        .select('uid, name')
        .in('uid', uids);
      const userMap = Object.fromEntries(users?.map(u => [u.uid, u.name]) || []);
      setMetricsData(data.map(metric => ({
        ...metric,
        student_name: userMap[metric.uid] || metric.uid
      })));
    }
    setLoading(false);
  };

  const fetchAllStudents = async () => {
    const { data } = await supabase
      .from('login_users')
      .select('uid, name, email')
      .eq('user_type', 'student');
    if (data) setStudentsList(data);
  };

  const handleScoreChange = (studentUid: string, value: string) => {
    setScoreInputs(prev => ({ ...prev, [studentUid]: value }));
  };

  const handleScoreSubmit = async (studentUid: string) => {
    const value = scoreInputs[studentUid];
    if (value === undefined || value === "") return;
    setGradingInProgress(prev => ({ ...prev, [studentUid]: true }));
    try {
      const { data: existing } = await supabase
        .from('performance_metrics')
        .select('id')
        .eq('uid', studentUid)
        .eq('course_name', selectedCourse)
        .single();
      if (existing) {
        const { error } = await supabase
          .from('performance_metrics')
          .update({ [selectedAssignment]: Number(value) })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('performance_metrics')
          .insert({
            uid: studentUid,
            course_name: selectedCourse,
            [selectedAssignment]: Number(value),
            created_at: new Date().toISOString(),
          });
        if (error) throw error;
      }
      toast.success("Score updated");
      setScoreInputs(prev => ({ ...prev, [studentUid]: "" }));
      fetchFacultyMetrics();
    } catch (error: any) {
      toast.error(error.message || "Failed to update score");
    } finally {
      setGradingInProgress(prev => ({ ...prev, [studentUid]: false }));
    }
  };

  const filteredMetrics = metricsData.filter(metric =>
    (metric.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
    metric.course_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getGradeColor = (grade: string) => {
    switch(grade) {
      case 'A+': case 'A': case 'A-': return 'bg-green-100 text-green-800';
      case 'B+': case 'B': case 'B-': return 'bg-blue-100 text-blue-800';
      case 'C+': case 'C': case 'C-': return 'bg-yellow-100 text-yellow-800';
      case 'D+': case 'D': case 'D-': return 'bg-orange-100 text-orange-800';
      case 'F': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#244855]"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold text-[#244855] mb-6">
        Grade Assignments
      </h1>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Grade Management System</CardTitle>
              <CardDescription>Update student academic records</CardDescription>
            </div>
            <div className="flex gap-4">
              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map(course => (
                    <SelectItem key={course} value={course}>{course}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Assessment Type" />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENTS.map(type => (
                    <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Current Score</TableHead>
                <TableHead className="text-right">New Score</TableHead>
                <TableHead className="text-right">Submit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentsList.map(student => {
                const metric = metricsData.find(m =>
                  m.uid === student.uid &&
                  m.course_name === selectedCourse
                );
                return (
                  <TableRow key={student.uid}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <UserCircle className="h-5 w-5 text-gray-400" />
                        {student.name}
                      </div>
                    </TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell className="text-right">
                      {metric?.[selectedAssignment] ?? 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="w-24"
                        placeholder="Score"
                        value={scoreInputs[student.uid] ?? ""}
                        onChange={e => handleScoreChange(student.uid, e.target.value)}
                        disabled={gradingInProgress[student.uid]}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => handleScoreSubmit(student.uid)}
                        disabled={gradingInProgress[student.uid] || !scoreInputs[student.uid]}
                      >
                        {gradingInProgress[student.uid] ? "Saving..." : "Submit"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Recent Performance
            </CardTitle>
            <CardDescription>View recently updated scores</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-[180px]"
              />
            </div>
            <Select onValueChange={setFilterCourse} defaultValue="all">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {courses.map(course => (
                  <SelectItem key={course} value={course}>
                    {course}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#244855] mx-auto mb-4"></div>
              <p>Loading performance data...</p>
            </div>
          ) : filteredMetrics.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No performance data found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Assignments</TableHead>
                    <TableHead>Quizzes</TableHead>
                    <TableHead>Exams</TableHead>
                    <TableHead className="text-center">Overall Grade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMetrics.map((metric) => (
                    <TableRow key={metric.id}>
                      <TableCell>{formatDate(metric.created_at)}</TableCell>
                      <TableCell>
                        {metric.student_name || "Unknown Student"}
                      </TableCell>
                      <TableCell>{metric.course_name}</TableCell>
                      <TableCell>{metric.assignments_score}</TableCell>
                      <TableCell>{metric.quizzes_score}</TableCell>
                      <TableCell>{metric.exams_score}</TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getGradeColor(metric.overall_grade)}`}>
                          {metric.overall_grade}
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
    </div>
  );
}

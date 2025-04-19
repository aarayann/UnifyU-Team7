import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface PerformanceMetric {
  id: string;
  uid: string;
  course_name: string;
  assignments_score: number;
  quizzes_score: number;
  exams_score: number;
  overall_grade: string;
  student_name?: string;
}

const PerformanceMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [filteredMetrics, setFilteredMetrics] = useState<PerformanceMetric[]>([]);
  const [search, setSearch] = useState("");
  const [userType, setUserType] = useState<"student" | "faculty">("student");

  // Fetch user type
  const fetchUserType = async (userId: string) => {
    const { data, error } = await supabase
      .from("login_users")
      .select("user_type")
      .eq("uid", userId)
      .single();
    if (data) setUserType(data.user_type);
  };

  // Fetch all metrics and join with student names for faculty
  const fetchPerformanceMetrics = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await fetchUserType(user.id);

    if (userType === "faculty") {
      // Get all performance metrics
      const { data: metricsData, error: metricsError } = await supabase
        .from("performance_metrics")
        .select("*");
      if (metricsError || !metricsData) return;

      // Get all unique student UIDs
      const uids = Array.from(new Set(metricsData.map((m: any) => m.uid)));
      // Fetch names from login_users
      let userMap: Record<string, string> = {};
      if (uids.length > 0) {
        const { data: users } = await supabase
          .from("login_users")
          .select("uid, name")
          .in("uid", uids);
        if (users) {
          userMap = Object.fromEntries(users.map((u: any) => [u.uid, u.name]));
        }
      }
      // Attach student_name to each metric
      const withNames = metricsData.map((m: any) => ({
        ...m,
        student_name: userMap[m.uid] || m.uid,
      }));
      setMetrics(withNames);
      setFilteredMetrics(withNames);
    } else {
      // Student view: only their own metrics
      const { data, error } = await supabase
        .from("performance_metrics")
        .select("*")
        .eq("uid", user.id);
      if (data) {
        setMetrics(data);
        setFilteredMetrics(data);
      }
    }
  };

  useEffect(() => {
    fetchPerformanceMetrics();
    // eslint-disable-next-line
  }, [userType]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value.toLowerCase();
    setSearch(query);
    setFilteredMetrics(
      metrics.filter(metric =>
        metric.course_name.toLowerCase().includes(query) ||
        (metric.student_name?.toLowerCase().includes(query) ?? false)
      )
    );
  };

  const getColorForGrade = (grade: string) => {
    switch (grade.toUpperCase()) {
      case "A":
      case "A+": return "bg-green-500";
      case "A-": return "bg-green-400";
      case "B":
      case "B+": return "bg-blue-500";
      case "B-": return "bg-blue-400";
      case "C":
      case "C+": return "bg-yellow-500";
      case "C-": return "bg-yellow-400";
      case "D":
      case "D+": return "bg-orange-500";
      case "D-": return "bg-orange-400";
      default: return "bg-red-500";
    }
  };

  // Chart configuration
  const chartData = {
    labels: filteredMetrics.map(m =>
      userType === "faculty"
        ? `${m.student_name} - ${m.course_name}`
        : m.course_name
    ),
    datasets: [
      {
        label: "Assignments",
        data: filteredMetrics.map(m => m.assignments_score),
        backgroundColor: "#3b82f6",
      },
      {
        label: "Quizzes",
        data: filteredMetrics.map(m => m.quizzes_score),
        backgroundColor: "#10b981",
      },
      {
        label: "Exams",
        data: filteredMetrics.map(m => m.exams_score),
        backgroundColor: "#f97316",
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top" as const,
      },
    },
  };

  return (
    <div className="w-full p-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">
        {userType === "faculty"
          ? "Student Performance Overview"
          : "My Performance Metrics"}
      </h1>

      <input
        type="text"
        placeholder={`Search by ${userType === "faculty" ? "student or course" : "course"}...`}
        value={search}
        onChange={handleSearchChange}
        className="mb-6 px-4 py-2 w-full max-w-md border rounded shadow-sm"
      />

      {userType === "student" && (
        <div className="bg-white shadow-md rounded p-6 mb-10">
          <h2 className="text-xl font-semibold mb-4">Score Comparison</h2>
          <Bar data={chartData} options={chartOptions} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMetrics.map((metric) => (
          <div key={metric.id} className="bg-white p-5 rounded shadow-md border">
            {userType === "faculty" && (
              <h3 className="text-lg font-bold text-gray-700 mb-2">
                {metric.student_name}
              </h3>
            )}
            <h4 className="text-md font-semibold text-gray-600 mb-2">
              {metric.course_name}
            </h4>
            <div className="text-sm text-gray-600 mb-2">
              <span className="font-semibold">Assignments:</span> {metric.assignments_score}%
            </div>
            <div className="text-sm text-gray-600 mb-2">
              <span className="font-semibold">Quizzes:</span> {metric.quizzes_score}%
            </div>
            <div className="text-sm text-gray-600 mb-2">
              <span className="font-semibold">Exams:</span> {metric.exams_score}%
            </div>
            <div className={`mt-3 text-white px-3 py-1 text-sm rounded-full ${getColorForGrade(metric.overall_grade)}`}>
              Overall Grade: {metric.overall_grade}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PerformanceMetrics;

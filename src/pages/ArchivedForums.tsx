import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Search,
  MessageSquare,
  UserCircle,
  ArrowLeft,
  RotateCcw,
  MessageSquareOff,
} from "lucide-react";

interface Forum {
  id: string;
  title: string;
  description: string;
  uid: string;
  created_at: string;
  replies_count: number;
  is_archived: boolean;
  creator?: {
    name: string;
    user_type: string;
  } | null;
}

interface ForumComment {
  id: number;
  forum_id: string;
  uid: string;
  comment: string;
  created_at: string;
  commenter?: {
    name: string;
    user_type: string;
  } | null;
}

export default function ArchivedForums() {
  const navigate = useNavigate();
  const [forums, setForums] = useState<Forum[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [unarchiving, setUnarchiving] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, ForumComment[]>>({});

  // Fetch archived forums, user info, and comments
  const fetchForums = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setUserId(user.id);

    // Get all archived forums
    const { data: forumsData, error } = await supabase
      .from("discussion_forums")
      .select("*")
      .eq("is_archived", true);

    if (error) {
      console.error("Error fetching forums:", error);
      toast.error("Failed to load archived forums");
      setLoading(false);
      return;
    }

    // Get unique user ids from forums
    const userUids = Array.from(new Set((forumsData || []).map((f: any) => f.uid)));
    // Fetch user info for all forum creators
    let userMap: Record<string, { name: string; user_type: string }> = {};
    if (userUids.length > 0) {
      const { data: users } = await supabase
        .from("login_users")
        .select("uid, name, user_type")
        .in("uid", userUids);
      if (users) {
        userMap = Object.fromEntries(users.map((u: any) => [u.uid, { name: u.name, user_type: u.user_type }]));
      }
    }

    // Get replies count for each forum
    const forumIds = (forumsData || []).map((forum: any) => forum.id);
    let repliesMap: Record<string, number> = {};
    if (forumIds.length) {
      const { data: replies } = await supabase
        .from("forum_comments")
        .select("forum_id");
      if (replies) {
        repliesMap = replies.reduce((acc: any, row: any) => {
          acc[row.forum_id] = (acc[row.forum_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    setForums(
      (forumsData || []).map((forum: any) => ({
        ...forum,
        replies_count: repliesMap[forum.id] || 0,
        creator: userMap[forum.uid] || null,
      }))
    );
    setLoading(false);

    // Fetch comments for all forums
    fetchAllComments(forumIds);
  };

  // Fetch all comments for a list of forum IDs, with commenter info
  const fetchAllComments = async (forumIds: string[]) => {
    if (!forumIds.length) return;
    const { data: commentsData, error } = await supabase
      .from("forum_comments")
      .select("*")
      .in("forum_id", forumIds)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to load comments");
      return;
    }

    // Get unique user ids from comments
    const commentUserUids = Array.from(new Set((commentsData || []).map((c: any) => c.uid)));
    let userMap: Record<string, { name: string; user_type: string }> = {};
    if (commentUserUids.length > 0) {
      const { data: users } = await supabase
        .from("login_users")
        .select("uid, name, user_type")
        .in("uid", commentUserUids);
      if (users) {
        userMap = Object.fromEntries(users.map((u: any) => [u.uid, { name: u.name, user_type: u.user_type }]));
      }
    }

    // Group comments by forum_id and add commenter info
    const grouped: Record<string, ForumComment[]> = {};
    (commentsData || []).forEach((comment: any) => {
      const withUser: ForumComment = {
        ...comment,
        commenter: userMap[comment.uid] || null,
      };
      if (!grouped[comment.forum_id]) grouped[comment.forum_id] = [];
      grouped[comment.forum_id].push(withUser);
    });
    setComments(grouped);
  };

  useEffect(() => {
    fetchForums();
    // eslint-disable-next-line
  }, [navigate]);

  const handleUnarchive = async (forumId: string) => {
    setUnarchiving(prev => ({ ...prev, [forumId]: true }));

    try {
      const { error } = await supabase
        .from("discussion_forums")
        .update({ is_archived: false })
        .eq("id", forumId);

      if (error) throw error;

      setForums(forums.filter(forum => forum.id !== forumId));
      toast.success("Forum restored successfully");
    } catch (error: any) {
      console.error("Error restoring forum:", error);
      toast.error("Failed to restore forum");
    } finally {
      setUnarchiving(prev => ({ ...prev, [forumId]: false }));
    }
  };

  const filteredForums = forums.filter(forum =>
    forum.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    forum.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="container mx-auto py-8">
      <Button 
        variant="ghost" 
        onClick={() => navigate("/discussion-forums")}
        className="mb-6 flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Forums</span>
      </Button>
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#244855]">Archived Forums</h1>
          <p className="text-gray-600 mt-1">View and manage your archived discussions</p>
        </div>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
        <Input
          type="text"
          placeholder="Search in archived forums..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#244855]"></div>
        </div>
      ) : filteredForums.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-gray-100 p-3 mb-4">
              <MessageSquareOff className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-medium mb-1">No archived forums found</h3>
            <p className="text-gray-500 text-center mb-6 max-w-md">
              {searchQuery 
                ? "We couldn't find any archived forums matching your search."
                : "You don't have any archived forums yet."}
            </p>
            <Button 
              variant="outline"
              onClick={() => navigate("/discussion-forums")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Forums</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredForums.map((forum) => (
            <Card key={forum.id} className="relative group bg-gray-50 hover:bg-white transition-colors">
              <div className="absolute top-2 right-2 px-2 py-1 bg-gray-200 text-gray-500 text-xs rounded-md">
                Archived
              </div>
              <CardHeader className="pb-3">
                <div>
                  <CardTitle className="text-xl text-gray-700">{forum.title}</CardTitle>
                  <CardDescription className="mt-1 text-gray-500 flex items-center">
                    <UserCircle className="h-4 w-4 mr-1" />
                    <span>
                      Created by {forum.creator?.name || "Unknown"} ({forum.creator?.user_type || "User"}) on {formatDate(forum.created_at)}
                    </span>
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-gray-600 line-clamp-2">{forum.description}</p>
                {/* Comments Section */}
                <div className="mt-4">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Comments
                  </h4>
                  {comments[forum.id]?.length ? (
                    <div className="space-y-3 mb-4">
                      {comments[forum.id].map((comment) => (
                        <div key={comment.id} className="bg-gray-50 rounded-md p-3">
                          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                            <UserCircle className="h-4 w-4" />
                            {comment.commenter?.name || "Unknown"} ({comment.commenter?.user_type || "User"})
                            <span>•</span>
                            {formatDate(comment.created_at)}
                          </div>
                          <div>{comment.comment}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 mb-4">No comments yet.</div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between pt-1">
                <div className="flex items-center text-sm text-gray-500">
                  <MessageSquare className="h-4 w-4 mr-1" />
                  <span>{forum.replies_count} {forum.replies_count === 1 ? "reply" : "replies"}</span>
                </div>
                <div className="flex gap-2">
                  {forum.uid === userId && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleUnarchive(forum.id)}
                      disabled={unarchiving[forum.id]}
                    >
                      {unarchiving[forum.id] ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-b-transparent border-[#244855]"></div>
                      ) : (
                        <>
                          <RotateCcw className="h-3 w-3 mr-1" />
                          <span>Restore</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search,
  PlusCircle,
  MessageSquare,
  UserCircle,
  Archive,
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

export default function DiscussionForums() {
  const navigate = useNavigate();
  const [forums, setForums] = useState<Forum[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [archiving, setArchiving] = useState<Record<string, boolean>>({});
  const [filterType, setFilterType] = useState<"all" | "my">("all");
  const [userId, setUserId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, ForumComment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState<Record<string, boolean>>({});

  // Fetch forums, user info, and comments
  const fetchForums = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setUserId(user.id);

    let query = supabase
      .from("discussion_forums")
      .select("*")
      .eq("is_archived", false);

    if (filterType === "my") {
      query = query.eq("uid", user.id);
    }

    const { data: forumsData, error } = await query;
    if (error) {
      console.error("Error fetching forums:", error);
      toast.error("Failed to load discussion forums");
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
  }, [filterType, navigate]);

  // Archive a forum (set is_archived = true), only for owner
  const handleArchiveToggle = async (forumId: string) => {
    setArchiving(prev => ({ ...prev, [forumId]: true }));
    try {
      const { error } = await supabase
        .from("discussion_forums")
        .update({ is_archived: true })
        .eq("id", forumId);
      if (error) throw error;
      setForums(forums.filter(forum => forum.id !== forumId));
      toast.success("Forum archived successfully");
    } catch (error: any) {
      console.error("Error archiving forum:", error);
      toast.error("Failed to archive forum");
    } finally {
      setArchiving(prev => ({ ...prev, [forumId]: false }));
    }
  };

  // Post a comment
  const handlePostComment = async (forumId: string) => {
    const comment = commentInputs[forumId]?.trim();
    if (!comment) return;
    setPosting(prev => ({ ...prev, [forumId]: true }));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be logged in to comment");
      setPosting(prev => ({ ...prev, [forumId]: false }));
      return;
    }

    const { error } = await supabase.from("forum_comments").insert({
      forum_id: forumId,
      uid: user.id,
      comment,
    });
    if (error) {
      toast.error("Failed to post comment");
    } else {
      setCommentInputs(prev => ({ ...prev, [forumId]: "" }));
      // Refetch comments for this forum
      fetchAllComments([forumId]);
    }
    setPosting(prev => ({ ...prev, [forumId]: false }));
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
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#244855]">Discussion Forums</h1>
          <p className="text-gray-600 mt-1">Engage in academic discussions with faculty and peers</p>
        </div>
        <Button 
          onClick={() => navigate("/create-forum")}
          className="flex items-center gap-2 bg-[#244855] hover:bg-[#1a363f]"
        >
          <PlusCircle className="h-5 w-5" />
          <span>Create New Forum</span>
        </Button>
      </div>

      <div className="mb-6 flex flex-col md:flex-row gap-4 md:items-center justify-between">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <Input
            type="text"
            placeholder="Search forums by title or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Tabs 
          defaultValue="all" 
          className="w-full md:w-auto"
          onValueChange={(value) => setFilterType(value as "all" | "my")}
        >
          <TabsList className="grid w-full grid-cols-2 md:w-[200px]">
            <TabsTrigger value="all">All Forums</TabsTrigger>
            <TabsTrigger value="my">My Forums</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <Button 
          variant="outline"
          className="flex items-center gap-2"
          onClick={() => navigate("/archived-forums")}
        >
          <Archive className="h-4 w-4" />
          <span>Archived Forums</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#244855]"></div>
        </div>
      ) : filteredForums.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-gray-100 p-3 mb-4">
              <MessageSquare className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-medium mb-1">No forums found</h3>
            <p className="text-gray-500 text-center mb-6 max-w-md">
              {searchQuery 
                ? "We couldn't find any forums matching your search. Try with different keywords."
                : filterType === "my" 
                  ? "You haven't created any discussion forums yet."
                  : "There are no discussion forums yet."}
            </p>
            <Button 
              onClick={() => navigate("/create-forum")}
              className="flex items-center gap-2"
            >
              <PlusCircle className="h-5 w-5" />
              <span>Create New Forum</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredForums.map((forum) => (
            <Card key={forum.id} className="relative group hover:border-[#244855]/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl text-[#244855]">{forum.title}</CardTitle>
                    <CardDescription className="mt-1 text-gray-500 flex items-center">
                      <UserCircle className="h-4 w-4 mr-1" />
                      <span>
                        Created by {forum.creator?.name || "Unknown"} ({forum.creator?.user_type || "User"}) on {formatDate(forum.created_at)}
                      </span>
                    </CardDescription>
                  </div>
                  {forum.uid === userId && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleArchiveToggle(forum.id)}
                      disabled={archiving[forum.id]}
                    >
                      {archiving[forum.id] ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-b-transparent border-[#244855]"></div>
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                      <span className="ml-1">Archive</span>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-gray-700 mb-4">{forum.description}</p>
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
                  <div className="flex flex-col gap-2">
                    <Textarea
                      placeholder="Add a comment..."
                      value={commentInputs[forum.id] || ""}
                      onChange={e =>
                        setCommentInputs(prev => ({
                          ...prev,
                          [forum.id]: e.target.value,
                        }))
                      }
                      rows={2}
                      disabled={posting[forum.id]}
                    />
                    <Button
                      onClick={() => handlePostComment(forum.id)}
                      disabled={posting[forum.id] || !commentInputs[forum.id]?.trim()}
                      size="sm"
                    >
                      {posting[forum.id] ? "Posting..." : "Post Comment"}
                    </Button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between pt-1">
                <div className="flex items-center text-sm text-gray-500">
                  <MessageSquare className="h-4 w-4 mr-1" />
                  <span>{forum.replies_count} {forum.replies_count === 1 ? "reply" : "replies"}</span>
                </div>
                {/* You may link to a dedicated discussion page if needed */}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

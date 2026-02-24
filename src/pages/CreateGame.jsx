import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Plus, 
  Trash2, 
  Trophy,
  Calendar,
  Save,
  Loader2,
  CheckCircle,
  Upload as UploadIcon,
  Edit,
  Trash,
  HelpCircle,
  Flag,
  Lock,
  Unlock,
  Settings,
  XCircle
} from "lucide-react";
import { supabase } from '@/api/supabaseClient';
import * as db from '@/api/entities';
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/components/contexts/GameContext";

export default function CreateGame() {
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingGame, setEditingGame] = useState(null);
  
  // State for game form
  const [gameForm, setGameForm] = useState({
    game_name: "",
    game_subtitle: "",
    game_description: "",
    game_type: "league",
    game_icon: "",
    start_date: "",
    end_date: "",
    teams_data: [],
    validation_lists: []
  });
  const [uploadingIcon, setUploadingIcon] = useState(false);

  // States for teams
  const [currentTeam, setCurrentTeam] = useState({ name: "", logo_url: "" });
  
  // States for validation lists
  const [currentList, setCurrentList] = useState({ name: "", options: [""] });
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [pasteValidationData, setPasteValidationData] = useState("");

  // State for paste teams dialog
  const [showPasteTeamsDialog, setShowPasteTeamsDialog] = useState(false);
  const [pasteTeamsData, setPasteTeamsData] = useState("");

  // State for dates info dialog
  const [showDatesInfoDialog, setShowDatesInfoDialog] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();
  const { refreshGames } = useGame();

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    setLoading(true);
    try {
      const allGames = await db.Game.filter({}, '-created_date', 100);
      setGames(allGames);
    } catch (error) {
      console.error("Error loading games:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לטעון משחקים",
        variant: "destructive"
      });
      setGames([]);
    }
    setLoading(false);
  };

  const openNewGameDialog = () => {
    setEditingGame(null);
    setGameForm({
      game_name: "",
      game_subtitle: "",
      game_description: "",
      game_type: "league",
      game_icon: "",
      start_date: "",
      end_date: "",
      teams_data: [],
      validation_lists: []
    });
    setCurrentTeam({ name: "", logo_url: "" });
    setCurrentList({ name: "", options: [""] });
    setShowDialog(true);
  };

  const openEditDialog = (game) => {
    setEditingGame(game);
    setGameForm({
      game_name: game.game_name || "",
      game_subtitle: game.game_subtitle || "",
      game_description: game.game_description || "",
      game_type: game.game_type || "league",
      game_icon: game.game_icon || "",
      start_date: game.start_date || "",
      end_date: game.end_date || "",
      teams_data: game.teams_data || [],
      validation_lists: game.validation_lists || []
    });
    setCurrentTeam({ name: "", logo_url: "" });
    setCurrentList({ name: "", options: [""] });
    setShowDialog(true);
  };

  const deleteGame = async (gameId, gameName) => {
    if (!window.confirm(`האם למחוק את המשחק "${gameName}"? פעולה זו תמחק גם את כל השאלות והניחושים! בלתי הפיך!`)) {
      return;
    }

    try {
      await db.Game.delete(gameId);
      await loadGames();
      await refreshGames();

      toast({
        title: "נמחק!",
        description: `המשחק "${gameName}" נמחק בהצלחה`,
        className: "bg-green-100 text-green-800"
      });
    } catch (error) {
      console.error("Error deleting game:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן למחוק את המשחק",
        variant: "destructive"
      });
    }
  };

  const cycleGameStatus = async (gameId, currentStatus) => {
    try {
      const statusCycle = {
        'draft': 'active',
        'active': 'locked',
        'locked': 'closed',
        'closed': 'draft'
      };
      
      const newStatus = statusCycle[currentStatus] || 'draft';
      await db.Game.update(gameId, { status: newStatus });
      await loadGames();
      await refreshGames();
      
      const statusLabels = {
        'draft': 'הקמה',
        'active': 'פתוח למילוי',
        'locked': 'נעול',
        'closed': 'סגור'
      };
      
      const statusDescriptions = {
        'draft': 'רק מנהלים רואים את המשחק',
        'active': 'המשחק פתוח למילוי ניחושים',
        'locked': 'אין מילוי - ניתן רק לצפות',
        'closed': 'המשחק סגור ולא יופיע למשתמשים'
      };
      
      toast({
        title: `סטטוס עודכן ל: ${statusLabels[newStatus]}`,
        description: statusDescriptions[newStatus],
        className: "bg-cyan-900/30 border-cyan-500 text-cyan-200"
      });
    } catch (error) {
      console.error("Error changing game status:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לשנות את מצב המשחק",
        variant: "destructive"
      });
    }
  };

  const saveGame = async () => {
    if (!gameForm.game_name.trim()) {
      toast({
        title: "שגיאה",
        description: "נא למלא שם משחק",
        variant: "destructive"
      });
      return;
    }

    try {
      const gameData = {
        ...gameForm,
        status: "draft"
      };

      if (editingGame) {
        await db.Game.update(editingGame.id, gameData);
        toast({
          title: "עודכן!",
          description: "המשחק עודכן בהצלחה",
          className: "bg-green-100 text-green-800"
        });
      } else {
        await db.Game.create(gameData);
        toast({
          title: "נוצר!",
          description: "המשחק נוצר בהצלחה",
          className: "bg-green-100 text-green-800"
        });
      }

      await loadGames();
      await refreshGames();
      setShowDialog(false);

    } catch (error) {
      console.error("Error saving game:", error);
      toast({
        title: "שגיאה",
        description: "שמירת המשחק נכשלה",
        variant: "destructive"
      });
    }
  };

  // Team functions
  const addTeam = () => {
    if (!currentTeam.name.trim()) return;
    
    setGameForm(prev => ({
      ...prev,
      teams_data: [...prev.teams_data, { ...currentTeam }]
    }));
    setCurrentTeam({ name: "", logo_url: "" });
  };

  const removeTeam = (index) => {
    setGameForm(prev => ({
      ...prev,
      teams_data: prev.teams_data.filter((_, i) => i !== index)
    }));
  };

  const editTeam = (index) => {
    const team = gameForm.teams_data[index];
    setCurrentTeam({ ...team });
    removeTeam(index);
  };

  // Paste teams from Excel
  const handlePasteTeamsData = () => {
    if (!pasteTeamsData.trim()) {
      toast({
        title: "שגיאה",
        description: "אין נתונים להדביק",
        variant: "destructive"
      });
      return;
    }

    try {
      const lines = pasteTeamsData.split(/\r\n|\r|\n/).filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({
          title: "שגיאה",
          description: "נדרשת לפחות שורת כותרת ושורת נתונים אחת",
          variant: "destructive"
        });
        return;
      }

      const dataLines = lines.slice(1);
      const newTeams = [];

      dataLines.forEach((line) => {
        const separator = line.includes('\t') ? '\t' : ',';
        const parts = line.split(separator).map(s => s.trim());
        
        const teamName = parts[0];
        const logoUrl = parts[1] || "";
        
        if (teamName) {
          newTeams.push({
            name: teamName,
            logo_url: logoUrl
          });
        }
      });

      if (newTeams.length === 0) {
        toast({
          title: "שגיאה",
          description: "לא נמצאו קבוצות תקינות בנתונים",
          variant: "destructive"
        });
        return;
      }

      setGameForm(prev => ({
        ...prev,
        teams_data: [...prev.teams_data, ...newTeams]
      }));
      
      toast({
        title: "הצלחה!",
        description: `נטענו ${newTeams.length} קבוצות`,
        className: "bg-green-100 text-green-800"
      });

      setPasteTeamsData('');
      setShowPasteTeamsDialog(false);

    } catch (error) {
      console.error("Error processing teams paste data:", error);
      toast({
        title: "שגיאה",
        description: "עיבוד הנתונים נכשל",
        variant: "destructive"
      });
    }
  };

  // Validation list functions
  const addOptionToCurrentList = () => {
    setCurrentList(prev => ({
      ...prev,
      options: [...prev.options, ""]
    }));
  };

  const updateListOption = (index, value) => {
    setCurrentList(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => i === index ? value : opt)
    }));
  };

  const removeListOption = (index) => {
    if (currentList.options.length === 1) return;
    setCurrentList(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const addValidationList = () => {
    if (!currentList.name.trim()) return;
    
    const validOptions = currentList.options.filter(opt => opt.trim());
    if (validOptions.length === 0) return;

    setGameForm(prev => ({
      ...prev,
      validation_lists: [...prev.validation_lists, {
        list_name: currentList.name,
        options: validOptions
      }]
    }));
    
    setCurrentList({ name: "", options: [""] });
  };

  const removeValidationList = (index) => {
    setGameForm(prev => ({
      ...prev,
      validation_lists: prev.validation_lists.filter((_, i) => i !== index)
    }));
  };

  // Paste validation data
  const handlePasteValidationData = () => {
    if (!pasteValidationData.trim()) {
      toast({
        title: "שגיאה",
        description: "אין נתונים להדביק",
        variant: "destructive"
      });
      return;
    }

    try {
      const lines = pasteValidationData.split(/\r\n|\r|\n/).filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({
          title: "שגיאה",
          description: "נדרשת לפחות שורת כותרת ושורת נתונים אחת",
          variant: "destructive"
        });
        return;
      }

      const dataLines = lines.slice(1);
      const groupedLists = {};
      
      dataLines.forEach((line) => {
        const separator = line.includes('\t') ? '\t' : ',';
        const parts = line.split(separator).map(s => s.trim());
        
        const list_name = parts[0];
        const option = parts[1];
        
        if (list_name && option) {
          if (!groupedLists[list_name]) {
            groupedLists[list_name] = [];
          }
          groupedLists[list_name].push(option);
        }
      });

      const hebrewLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];
      const newLists = Object.entries(groupedLists).map(([list_name, options]) => {
        const isCycleList = list_name.includes('מחזור');
        
        if (isCycleList && options.length <= hebrewLetters.length) {
          return {
            list_name,
            options: hebrewLetters.slice(0, options.length)
          };
        }
        
        return {
          list_name,
          options
        };
      });

      setGameForm(prev => ({
        ...prev,
        validation_lists: [...prev.validation_lists, ...newLists]
      }));
      
      toast({
        title: "הצלחה!",
        description: `נטענו ${newLists.length} רשימות אימות`,
      });

      setPasteValidationData('');
      setShowPasteDialog(false);

    } catch (error) {
      console.error("Error processing paste data:", error);
      toast({
        title: "שגיאה",
        description: "עיבוד הנתונים נכשל",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#06b6d4' }} />
        <span className="mr-3" style={{ color: '#06b6d4' }}>טוען...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      minHeight: '100vh'
    }}>
      <div className="mb-8 flex justify-between items-center">
        <h1 className="text-4xl font-bold flex items-center gap-3" style={{ 
          color: '#f8fafc',
          textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
        }}>
          <Trophy className="w-10 h-10" style={{ color: '#06b6d4' }} />
          ניהול משחקים
        </h1>
        <div className="flex gap-3">
          <Button
            onClick={openNewGameDialog}
            size="lg"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white'
            }}
          >
            <Plus className="w-5 h-5 ml-2" />
            צור משחק חדש
          </Button>
        </div>
      </div>

      {games.length === 0 ? (
        <Alert style={{
          background: 'rgba(6, 182, 212, 0.1)',
          border: '1px solid rgba(6, 182, 212, 0.3)'
        }}>
          <AlertDescription style={{ color: '#94a3b8' }}>
            אין משחקים במערכת. לחץ "צור משחק חדש" כדי להתחיל.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game) => (
            <Card
              key={game.id}
              style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                backdropFilter: 'blur(10px)'
              }}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle style={{ color: '#f8fafc' }}>
                      {game.game_name}
                    </CardTitle>
                    {game.game_subtitle && (
                      <p className="text-sm mt-1" style={{ color: '#06b6d4' }}>
                        {game.game_subtitle}
                      </p>
                    )}
                  </div>
                  <Badge
                    style={{
                      background: game.status === 'active' 
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : game.status === 'draft'
                        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                        : game.status === 'form_building'
                        ? 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)'
                        : 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                      color: 'white'
                    }}
                  >
                    {game.status === 'active' ? 'פעיל' : 
                     game.status === 'draft' ? 'טיוטה' :
                     game.status === 'form_building' ? 'בניית טופס' : 'הושלם'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {game.game_description && (
                  <p className="text-sm mb-3" style={{ color: '#94a3b8' }}>
                    {game.game_description}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mb-4">
                  {game.teams_data && game.teams_data.length > 0 && (
                    <Badge variant="outline" style={{ borderColor: '#06b6d4', color: '#06b6d4' }}>
                      <Trophy className="w-3 h-3 ml-1" />
                      {game.teams_data.length} קבוצות
                    </Badge>
                  )}
                  {game.validation_lists && game.validation_lists.length > 0 && (
                    <Badge variant="outline" style={{ borderColor: '#8b5cf6', color: '#8b5cf6' }}>
                      <CheckCircle className="w-3 h-3 ml-1" />
                      {game.validation_lists.length} רשימות
                    </Badge>
                  )}
                  {game.start_date && (
                    <Badge variant="outline" style={{ borderColor: '#10b981', color: '#10b981' }}>
                      <Calendar className="w-3 h-3 ml-1" />
                      {new Date(game.start_date).toLocaleDateString('he-IL')}
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => cycleGameStatus(game.id, game.status)}
                    size="sm"
                    style={{
                      background: game.status === 'draft' 
                        ? 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
                        : game.status === 'active'
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : game.status === 'locked'
                        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                        : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: 'white'
                    }}
                  >
                    {game.status === 'draft' ? (
                      <>
                        <Settings className="w-3 h-3 ml-1" />
                        הקמה
                      </>
                    ) : game.status === 'active' ? (
                      <>
                        <Unlock className="w-3 h-3 ml-1" />
                        פתוח
                      </>
                    ) : game.status === 'locked' ? (
                      <>
                        <Lock className="w-3 h-3 ml-1" />
                        נעול
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3 ml-1" />
                        סגור
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => openEditDialog(game)}
                    size="sm"
                    className="flex-1"
                    style={{
                      background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                      color: 'white'
                    }}
                  >
                    <Edit className="w-3 h-3 ml-1" />
                    ערוך
                  </Button>
                  <Button
                    onClick={() => deleteGame(game.id, game.game_name)}
                    size="sm"
                    variant="destructive"
                  >
                    <Trash className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog for creating/editing game */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflow: 'auto'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4', fontSize: '24px' }}>
              {editingGame ? 'עריכת משחק' : 'יצירת משחק חדש'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* פרטי משחק בסיסיים */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold" style={{ color: '#06b6d4' }}>פרטי משחק</h3>
              
              <Input
                placeholder="שם המשחק *"
                value={gameForm.game_name}
                onChange={(e) => setGameForm({...gameForm, game_name: e.target.value})}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  color: '#f8fafc'
                }}
              />

              <Input
                placeholder="כותרת משנה (אופציונלי)"
                value={gameForm.game_subtitle}
                onChange={(e) => setGameForm({...gameForm, game_subtitle: e.target.value})}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  color: '#f8fafc'
                }}
              />

              <div className="space-y-2">
                <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>
                  אייקון המשחק (אופציונלי)
                </label>
                <div className="flex gap-3 items-center">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadingIcon(true);
                        try {
                          const { data: { publicUrl: file_url } } = supabase.storage.from('uploads').getPublicUrl((await supabase.storage.from('uploads').upload(`${Date.now()}.${file.name.split('.').pop()}`, file)).data?.path || '');
                          setGameForm({...gameForm, game_icon: file_url});
                          toast({ title: "האייקון הועלה בהצלחה!", className: "bg-green-100 text-green-800" });
                        } catch (err) {
                          toast({ title: "שגיאה בהעלאת האייקון", variant: "destructive" });
                        }
                        setUploadingIcon(false);
                      }
                    }}
                    disabled={uploadingIcon}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}
                  />
                  {gameForm.game_icon && (
                    <img src={gameForm.game_icon} alt="Game icon" className="w-16 h-16 rounded-lg object-cover border border-cyan-500" />
                  )}
                </div>
              </div>

              <Textarea
                placeholder="תיאור המשחק (אופציונלי)"
                value={gameForm.game_description}
                onChange={(e) => setGameForm({...gameForm, game_description: e.target.value})}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  color: '#f8fafc'
                }}
              />

              {/* תאריכים + כפתור עזרה */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium" style={{ color: '#94a3b8' }}>תאריכים</h4>
                  <Button
                    onClick={() => setShowDatesInfoDialog(true)}
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    style={{ color: '#06b6d4' }}
                  >
                    <HelpCircle className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="date"
                    placeholder="תאריך התחלה"
                    value={gameForm.start_date}
                    onChange={(e) => setGameForm({...gameForm, start_date: e.target.value})}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}
                  />
                  <Input
                    type="date"
                    placeholder="תאריך סיום"
                    value={gameForm.end_date}
                    onChange={(e) => setGameForm({...gameForm, end_date: e.target.value})}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(6, 182, 212, 0.2)',
                      color: '#f8fafc'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Teams */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold" style={{ color: '#06b6d4' }}>קבוצות</h3>
                <Button
                  onClick={() => setShowPasteTeamsDialog(true)}
                  size="sm"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <Flag className="w-4 h-4 ml-1" />
                  הדבק מאקסל
                </Button>
              </div>
              
              <div className="flex gap-4">
                <Input
                  placeholder="שם קבוצה"
                  value={currentTeam.name}
                  onChange={(e) => setCurrentTeam({...currentTeam, name: e.target.value})}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                />
                <Input
                  placeholder="URL לוגו (אופציונלי)"
                  value={currentTeam.logo_url}
                  onChange={(e) => setCurrentTeam({...currentTeam, logo_url: e.target.value})}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                />
                <Button onClick={addTeam} style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white'
                }}>
                  הוסף קבוצה
                </Button>
              </div>

              {gameForm.teams_data.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {gameForm.teams_data.map((team, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-md" style={{
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(6, 182, 212, 0.1)'
                    }}>
                      <div className="flex items-center gap-3">
                        {team.logo_url && (
                          <img 
                            src={team.logo_url} 
                            alt={team.name} 
                            className="w-8 h-8 rounded-full object-cover" 
                            onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                          />
                        )}
                        <span style={{ color: '#f8fafc' }}>{team.name}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => editTeam(index)} variant="ghost" size="sm" style={{ color: '#06b6d4' }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button onClick={() => removeTeam(index)} variant="destructive" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Validation Lists */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold" style={{ color: '#06b6d4' }}>רשימות אימות</h3>
              
              <Input
                placeholder="שם הרשימה (למשל: מחזורים)"
                value={currentList.name}
                onChange={(e) => setCurrentList({ ...currentList, name: e.target.value })}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  color: '#f8fafc'
                }}
              />

              <div className="space-y-2">
                {currentList.options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={option}
                      onChange={(e) => updateListOption(index, e.target.value)}
                      placeholder={`אפשרות ${index + 1}...`}
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(6, 182, 212, 0.2)',
                        color: '#f8fafc'
                      }}
                    />
                    {currentList.options.length > 1 && (
                      <Button
                        onClick={() => removeListOption(index)}
                        variant="ghost"
                        size="sm"
                        className="text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={addOptionToCurrentList}
                  variant="outline"
                  size="sm"
                  style={{
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    color: '#06b6d4'
                  }}
                >
                  <Plus className="w-4 h-4 ml-1" />
                  הוסף אפשרות
                </Button>
                <Button
                  onClick={addValidationList}
                  size="sm"
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                    color: 'white'
                  }}
                >
                  שמור רשימה
                </Button>
              </div>

              {gameForm.validation_lists.map((list, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg"
                  style={{
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid rgba(6, 182, 212, 0.1)'
                  }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium" style={{ color: '#f8fafc' }}>{list.list_name}</div>
                    <Button
                      onClick={() => removeValidationList(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {list.options.map((opt, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        style={{
                          borderColor: 'rgba(6, 182, 212, 0.5)',
                          color: '#06b6d4'
                        }}
                      >
                        {opt}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}

              <Button
                onClick={() => setShowPasteDialog(true)}
                size="sm"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)'
                }}
              >
                <UploadIcon className="w-4 h-4 ml-1" />
                הדבק רשימות מאקסל
              </Button>
            </div>
            
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                style={{
                  borderColor: 'rgba(6, 182, 212, 0.3)',
                  color: '#94a3b8'
                }}
              >
                ביטול
              </Button>
              <Button
                onClick={saveGame}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white'
                }}
              >
                <Save className="w-5 h-5 ml-2" />
                {editingGame ? 'עדכן משחק' : 'צור משחק'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג הדבקת קבוצות */}
      <Dialog open={showPasteTeamsDialog} onOpenChange={setShowPasteTeamsDialog}>
        <DialogContent style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          maxWidth: '800px'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4', fontSize: '20px' }}>
              הדבק קבוצות + לוגואים מאקסל
            </DialogTitle>
            <DialogDescription style={{ color: '#94a3b8' }}>
              טען רשימת קבוצות עם לוגואים ישירות מאקסל
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <AlertDescription style={{ color: '#94a3b8' }}>
                <p className="font-semibold mb-1" style={{ color: '#10b981' }}>📋 פורמט הקובץ:</p>
                <div className="text-sm space-y-2">
                  <p><strong>עמודה 1:</strong> שם קבוצה</p>
                  <p><strong>עמודה 2:</strong> URL של לוגו הקבוצה</p>
                  <div className="mt-3 p-2 rounded" style={{ background: 'rgba(6, 182, 212, 0.1)' }}>
                    <p className="font-mono text-xs">
                      שם קבוצה | URL לוגו<br/>
                      מכבי תל אביב | https://example.com/logo1.png<br/>
                      הפועל באר שבע | https://example.com/logo2.png
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            <textarea
              className="w-full h-64 p-4 border rounded-lg font-mono text-sm"
              placeholder="הדבק כאן את הנתונים מהאקסל..."
              value={pasteTeamsData}
              onChange={(e) => setPasteTeamsData(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                color: '#f8fafc'
              }}
            />

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPasteTeamsDialog(false);
                  setPasteTeamsData('');
                }}
                style={{
                  borderColor: 'rgba(6, 182, 212, 0.3)',
                  color: '#94a3b8'
                }}
              >
                ביטול
              </Button>
              <Button
                onClick={handlePasteTeamsData}
                disabled={!pasteTeamsData.trim()}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                  color: 'white',
                  boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
                }}
              >
                <CheckCircle className="w-5 h-5 ml-2" />
                טען קבוצות
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג הסבר על תאריכים */}
      <Dialog open={showDatesInfoDialog} onOpenChange={setShowDatesInfoDialog}>
        <DialogContent style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          maxWidth: '600px'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4', fontSize: '20px' }}>
              <HelpCircle className="w-6 h-6 inline ml-2" />
              משמעות שדות התאריכים
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Alert style={{
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              <AlertDescription style={{ color: '#94a3b8' }}>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold mb-1" style={{ color: '#06b6d4' }}>
                      <Calendar className="w-4 h-4 inline ml-1" />
                      תאריך התחלה
                    </h4>
                    <p className="text-sm">
                      התאריך שבו המשחק או הטורניר מתחיל רשמית.<br/>
                      <strong>שימוש:</strong> מוצג למשתתפים ומשמש לארגון ומעקב.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold mb-1" style={{ color: '#06b6d4' }}>
                      <Calendar className="w-4 h-4 inline ml-1" />
                      תאריך סיום
                    </h4>
                    <p className="text-sm">
                      התאריך שבו המשחק או הטורניר מסתיים.<br/>
                      <strong>שימוש:</strong> מוצג למשתתפים ומסמן את סוף תקופת הניחושים.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg" style={{ 
                    background: 'rgba(251, 191, 36, 0.1)',
                    border: '1px solid rgba(251, 191, 36, 0.3)'
                  }}>
                    <p className="text-xs" style={{ color: '#fbbf24' }}>
                      💡 <strong>טיפ:</strong> השדות הללו הם אופציונליים אך מומלצים לארגון טוב יותר של המשחקים שלך.
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button
                onClick={() => setShowDatesInfoDialog(false)}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                  color: 'white'
                }}
              >
                הבנתי
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג הדבקת רשימות אימות */}
      <Dialog open={showPasteDialog} onOpenChange={setShowPasteDialog}>
        <DialogContent style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          maxWidth: '800px'
        }} dir="rtl">
          <DialogHeader>
            <DialogTitle style={{ color: '#06b6d4', fontSize: '20px' }}>
              הדבק נתונים מאקסל
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Alert style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <AlertDescription style={{ color: '#94a3b8' }}>
                <p className="font-semibold mb-1" style={{ color: '#10b981' }}>איך זה עובד:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>פתח את קובץ האקסל עם רשימות האימות</li>
                  <li>בחר את כל הנתונים (כולל כותרות) - Ctrl+A</li>
                  <li>העתק - Ctrl+C</li>
                  <li>הדבק כאן למטה - Ctrl+V</li>
                  <li>לחץ "טען נתונים"</li>
                </ol>
                <p className="mt-2 text-xs">
                  <strong>פורמט הקובץ:</strong> עמודה ראשונה: list_name, עמודה שנייה: option
                </p>
              </AlertDescription>
            </Alert>

            <textarea
              className="w-full h-64 p-4 border rounded-lg font-mono text-sm"
              placeholder="הדבק כאן את הנתונים מהאקסל..."
              value={pasteValidationData}
              onChange={(e) => setPasteValidationData(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                color: '#f8fafc'
              }}
            />

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPasteDialog(false);
                  setPasteValidationData('');
                }}
                style={{
                  borderColor: 'rgba(6, 182, 212, 0.3)',
                  color: '#94a3b8'
                }}
              >
                ביטול
              </Button>
              <Button
                onClick={handlePasteValidationData}
                disabled={!pasteValidationData.trim()}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
                  color: 'white',
                  boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
                }}
              >
                <CheckCircle className="w-5 h-5 ml-2" />
                טען נתונים
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
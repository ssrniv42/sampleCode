<?php
//Track24 2013
//Author : Steven Crawford
//Co-Author: Masoud Omran
//G.U.I v2.5
// checks whether an asset is in use by sub-groups

session_start(); include $_SESSION['SYSCON_URL'];
					
	$owner = $_SESSION['SESS_CLIENT_ID'];
	$groupId = $_GET['group_id'];
	$assetId = $_GET['asset_id'];
	
	$status = array();
	$result = array();
	
	$qryUpdateGroupProfile = sprintf("SELECT * from groups_assets WHERE groups_assets.asset_id= '%s' AND groups_assets.group_id IN (SELECT id_group FROM groups WHERE groups.parent_id='%s' AND groups.client_num='%s')", $assetId, $groupId, $owner);
	
	$resultCheckGroupProfile = mysql_query($qryUpdateGroupProfile);

	if($resultCheckGroupProfile){
		$numrow= mysql_num_rows($resultCheckGroupProfile);
		array_push($result, array('count' => $numrow, 'query' => $qryUpdateGroupProfile));
		array_push($status , array('debug'=> $numrow . ' asset(s) in use by other gorups!'));
	}
	else{
		array_push($status , array('error'=>'Failed to Check Asset Group!'));
		array_push($status , array('debug'=>'Failed to Check Asset Group! SQL error : '.mysql_error()));
	}

	echo json_encode(array("status" =>$status, "result" => $result));		
	unset($_GET['group_id'], $_GET['asset_id'], $_GET['checked']);
	exit();
?>